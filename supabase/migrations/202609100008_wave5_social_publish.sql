-- Wave 5 — gated social publish outbox (dry-run).
-- Local/CI default remains the file/memory ops store.
-- No Instagram credentials. live_publish stays false.

create table if not exists social_publish_outbox (
  outbox_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  channel text not null default 'INSTAGRAM'
    check (channel in ('INSTAGRAM', 'LINKEDIN', 'FACEBOOK', 'X', 'TIKTOK')),
  mode text not null default 'DRY_RUN'
    check (mode in ('DRY_RUN', 'LIVE')),
  status text not null default 'DRY_RUN_RECORDED'
    check (status in ('DRY_RUN_RECORDED', 'LIVE_BLOCKED')),
  caption text not null,
  campaign_id uuid references campaigns(campaign_id),
  pack_id uuid,
  calendar_item_key text not null,
  intended_payload jsonb not null default '{}'::jsonb,
  actor text not null,
  rationale text not null,
  approval_id uuid references approvals(approval_id),
  live_publish boolean not null default false check (live_publish = false),
  live_ads boolean not null default false check (live_ads = false),
  created_at timestamptz not null default now()
);

create index if not exists social_publish_outbox_brand_id_idx
  on social_publish_outbox (brand_id, created_at desc);

alter table social_publish_outbox enable row level security;

drop policy if exists brand_isolation_social_publish_outbox on social_publish_outbox;
create policy brand_isolation_social_publish_outbox on social_publish_outbox
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table social_publish_outbox is
  'Wave 5 Instagram dry-run outbox. Records intended payload only; live_publish stays false.';
