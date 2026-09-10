-- Wave 6 — gated paid ads staging (recommend / dry-run).
-- Local/CI default remains the file/memory ops store.
-- No Meta/Google credentials. live_ads stays false.

create table if not exists ad_staging_jobs (
  job_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  platform text not null default 'META'
    check (platform in ('META', 'GOOGLE')),
  action text not null default 'LAUNCH'
    check (action in ('LAUNCH', 'BUDGET_MUTATION')),
  mode text not null default 'STAGING'
    check (mode in ('STAGING', 'LIVE')),
  status text not null default 'STAGING_RECORDED'
    check (status in ('STAGING_RECORDED', 'LIVE_BLOCKED')),
  campaign_id uuid references campaigns(campaign_id),
  pack_id uuid,
  outbox_id uuid not null,
  campaign_draft jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{"kind":"RECOMMENDATION","mutation_allowed":false}'::jsonb,
  actor text not null,
  rationale text not null,
  live_ads boolean not null default false check (live_ads = false),
  created_at timestamptz not null default now()
);

create table if not exists ad_outbox (
  outbox_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  platform text not null default 'META'
    check (platform in ('META', 'GOOGLE')),
  action text not null default 'LAUNCH'
    check (action in ('LAUNCH', 'BUDGET_MUTATION')),
  mode text not null default 'STAGING'
    check (mode in ('STAGING', 'LIVE')),
  status text not null default 'STAGING_RECORDED'
    check (status in ('STAGING_RECORDED', 'LIVE_BLOCKED')),
  campaign_id uuid references campaigns(campaign_id),
  pack_id uuid,
  campaign_draft jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{"kind":"RECOMMENDATION","mutation_allowed":false}'::jsonb,
  actor text not null,
  rationale text not null,
  approval_id uuid references approvals(approval_id),
  live_ads boolean not null default false check (live_ads = false),
  created_at timestamptz not null default now()
);

create index if not exists ad_staging_jobs_brand_id_idx
  on ad_staging_jobs (brand_id, created_at desc);

create index if not exists ad_outbox_brand_id_idx
  on ad_outbox (brand_id, created_at desc);

alter table ad_staging_jobs enable row level security;
alter table ad_outbox enable row level security;

drop policy if exists brand_isolation_ad_staging_jobs on ad_staging_jobs;
create policy brand_isolation_ad_staging_jobs on ad_staging_jobs
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_ad_outbox on ad_outbox;
create policy brand_isolation_ad_outbox on ad_outbox
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table ad_staging_jobs is
  'Wave 6 paid staging jobs. Records intended campaign draft only; live_ads stays false.';
comment on table ad_outbox is
  'Wave 6 paid staging outbox. Budget is recommendation-only; no live spend.';
