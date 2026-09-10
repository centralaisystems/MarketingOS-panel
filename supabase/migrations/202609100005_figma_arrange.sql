-- Marketing OS Wave 4b — Figma arrange jobs + generated catalog provenance
-- Apply after 202609100004_owner_review.sql when a Supabase project is provisioned.
-- Local/CI uses File/Memory job stores + FixtureFigmaArrangeAdapter. No Figma token required.

alter table if exists assets drop constraint if exists assets_source_check;
alter table if exists assets
  add constraint assets_source_check
  check (source is null or source in ('catalog', 'drive', 'figma'));

alter table if exists assets
  add column if not exists provenance text
    check (provenance in ('CATALOG', 'INGESTED', 'GENERATED'));

create table if not exists figma_arrange_jobs (
  job_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  source_asset_ids uuid[] not null default '{}',
  brand_kit_asset_ids uuid[] not null default '{}',
  layout_brief jsonb not null,
  status text not null check (status in (
    'ARRANGED',
    'GUARDIAN_REJECTED',
    'READY_FOR_OWNER_REVIEW'
  )),
  source text not null check (source in ('fixture', 'figma_api')),
  output jsonb not null,
  generated_asset_id uuid not null,
  guardian jsonb not null,
  knowledge_status text not null default 'UNVERIFIED' check (knowledge_status = 'UNVERIFIED'),
  provenance text not null default 'GENERATED' check (provenance = 'GENERATED'),
  approval_status text not null default 'DRAFT' check (approval_status = 'DRAFT'),
  live_publish boolean not null default false check (live_publish = false),
  live_ads boolean not null default false check (live_ads = false),
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists figma_arrange_jobs_brand_idx
  on figma_arrange_jobs (brand_id, created_at desc);

alter table figma_arrange_jobs enable row level security;

drop policy if exists brand_isolation_figma_arrange_jobs on figma_arrange_jobs;
create policy brand_isolation_figma_arrange_jobs on figma_arrange_jobs
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table figma_arrange_jobs is
  'Wave 4b Figma arrange jobs. Fixture-first. Generated catalog rows stay UNVERIFIED until approved. No live publish.';
