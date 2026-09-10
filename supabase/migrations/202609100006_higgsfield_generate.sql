-- Marketing OS Wave 4b — Higgsfield fill-gaps jobs + generated catalog source
-- Apply after 202609100005_figma_arrange.sql when a Supabase project is provisioned.
-- Local/CI uses File/Memory job stores + FixtureHiggsfieldAdapter. No Higgsfield key required.

alter table if exists assets drop constraint if exists assets_source_check;
alter table if exists assets
  add constraint assets_source_check
  check (source is null or source in ('catalog', 'drive', 'figma', 'higgsfield'));

create table if not exists higgsfield_generate_jobs (
  job_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  gap jsonb not null,
  layout_brief jsonb not null,
  prompt jsonb,
  source_asset_ids uuid[] not null default '{}',
  brand_kit_asset_ids uuid[] not null default '{}',
  status text not null check (status in (
    'SKIPPED_NO_GAP',
    'GENERATED',
    'GUARDIAN_REJECTED',
    'READY_FOR_OWNER_REVIEW'
  )),
  source text not null check (source in ('fixture', 'higgsfield_api')),
  output jsonb,
  generated_asset_id uuid,
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

create index if not exists higgsfield_generate_jobs_brand_idx
  on higgsfield_generate_jobs (brand_id, created_at desc);

alter table higgsfield_generate_jobs enable row level security;

drop policy if exists brand_isolation_higgsfield_generate_jobs on higgsfield_generate_jobs;
create policy brand_isolation_higgsfield_generate_jobs on higgsfield_generate_jobs
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table higgsfield_generate_jobs is
  'Wave 4b Higgsfield fill-gaps jobs. Fixture-first. Generates only when approved stills leave a gap. Generated catalog rows stay UNVERIFIED until approved. No live publish.';
