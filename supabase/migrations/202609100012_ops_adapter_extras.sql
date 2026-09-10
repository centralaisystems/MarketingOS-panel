-- Production-readiness — leftover domain fields for the optional Supabase ops adapter.
-- Local/CI default remains the file/memory store. live_publish / live_ads stay false.

alter table if exists tasks
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists audit_log
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists owner_reviews
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists owner_decisions
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists email_outbox
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists social_publish_outbox
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists ad_outbox
  add column if not exists extras jsonb not null default '{}'::jsonb;

alter table if exists ad_staging_jobs
  add column if not exists extras jsonb not null default '{}'::jsonb;

comment on column tasks.extras is
  'OpsStore fields not in the Wave 3 task columns (requested_by, input, priority, …).';
comment on column owner_reviews.extras is
  'Figma / Higgsfield / video attachment ids for owner review.';
