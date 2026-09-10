-- Marketing OS Wave 4b — video produce jobs + generated catalog source
-- Apply after 202609100006_higgsfield_generate.sql when a Supabase project is provisioned.
-- Local/CI uses File/Memory job stores + FixtureVideoProducerAdapter.
-- CapCut / Adobe Premiere stubs emit the same export package. No desktop software required.

alter table if exists assets drop constraint if exists assets_source_check;
alter table if exists assets
  add constraint assets_source_check
  check (source is null or source in ('catalog', 'drive', 'figma', 'higgsfield', 'video'));

create table if not exists video_produce_jobs (
  job_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  brief jsonb not null,
  approved_still_ids uuid[] not null default '{}',
  generated_asset_ids uuid[] not null default '{}',
  target_format text not null check (target_format in ('reel', 'story', 'feed')),
  status text not null check (status in (
    'PACKAGED',
    'GUARDIAN_REJECTED',
    'READY_FOR_OWNER_REVIEW'
  )),
  source text not null check (source in ('fixture', 'capcut', 'adobe_premiere')),
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

create index if not exists video_produce_jobs_brand_idx
  on video_produce_jobs (brand_id, created_at desc);

alter table video_produce_jobs enable row level security;

drop policy if exists brand_isolation_video_produce_jobs on video_produce_jobs;
create policy brand_isolation_video_produce_jobs on video_produce_jobs
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table video_produce_jobs is
  'Wave 4b video export packages. Fixture-first. CapCut/Adobe stubs emit a project recipe only — no desktop control, no rendered video, no live publish.';
