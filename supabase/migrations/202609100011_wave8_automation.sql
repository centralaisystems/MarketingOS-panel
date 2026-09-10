-- Wave 8 — scheduled automation digests (count-only).
-- Local/CI default remains the file/memory ops store.
-- Do not store raw email/phone. live_publish / live_ads stay false.

create table if not exists automation_digests (
  digest_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  period text not null
    check (period in ('daily', 'weekly')),
  generated_at timestamptz not null default now(),
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null
    check (status in ('BUILT', 'RECORDED', 'BLOCKED')),
  blocked_reason text,
  email_outbox_id uuid,
  summary jsonb not null default '{}'::jsonb,
  analytics jsonb not null default '{}'::jsonb,
  costs jsonb not null default '{}'::jsonb,
  live_publish boolean not null default false,
  live_ads boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists automation_digests_brand_id_idx
  on automation_digests (brand_id, created_at desc);

alter table automation_digests enable row level security;

drop policy if exists brand_isolation_automation_digests on automation_digests;
create policy brand_isolation_automation_digests on automation_digests
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table automation_digests is
  'Wave 8 scheduled digests. Store counts only — never raw email/phone.';
