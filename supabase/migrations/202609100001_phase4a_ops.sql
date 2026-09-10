-- Marketing OS Phase 4a — Ops data plane (Wave 3)
-- RLS by brand_id. Apply only after a Supabase project is provisioned.
-- Local/CI default is the file/memory store in @marketing-os/runtime (same row shapes).
-- Live publish/ads remain gated by reports/agency/PHASE_GATES.json.

create extension if not exists "pgcrypto";

create table if not exists brands (
  brand_id text primary key,
  slug text not null unique,
  display_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  task_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  campaign_id uuid,
  objective text not null,
  assigned_agent text,
  workflow_state text not null default 'IDEA',
  approval_level text not null default 'LEVEL_1'
    check (approval_level in ('LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3')),
  status text not null default 'PENDING',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  campaign_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  pack_id uuid not null,
  objective text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'INTERNAL_APPROVED', 'REJECTED', 'BLOCKED')),
  pack jsonb not null default '{}'::jsonb,
  guardian_passed boolean not null default false,
  approvable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approvals (
  approval_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  task_id uuid references tasks(task_id),
  campaign_id uuid references campaigns(campaign_id),
  level text not null check (level in ('LEVEL_0', 'LEVEL_1', 'LEVEL_2', 'LEVEL_3')),
  decision text not null default 'PENDING'
    check (decision in ('PENDING', 'APPROVED', 'REJECTED', 'BLOCKED')),
  rationale text,
  actor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_runs (
  run_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  task_id uuid references tasks(task_id),
  agent text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists memory_items (
  memory_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  scope text not null default 'BRAND',
  content jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  event_id uuid primary key default gen_random_uuid(),
  brand_id text not null,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Wave 4/7 placeholders (not used by the Wave 3 panel)
create table if not exists assets (
  asset_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  title text not null,
  mime_type text,
  storage_uri text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  lead_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  pii_ref text not null,
  source text not null,
  campaign_id uuid references campaigns(campaign_id),
  stage text not null default 'NEW',
  created_at timestamptz not null default now()
);

create index if not exists tasks_brand_id_idx on tasks (brand_id, created_at desc);
create index if not exists campaigns_brand_id_idx on campaigns (brand_id, created_at desc);
create index if not exists approvals_brand_id_idx on approvals (brand_id, decision, created_at desc);
create index if not exists agent_runs_brand_id_idx on agent_runs (brand_id, created_at desc);
create index if not exists audit_log_brand_id_idx on audit_log (brand_id, created_at desc);
create index if not exists memory_items_brand_id_idx on memory_items (brand_id);
create index if not exists assets_brand_id_idx on assets (brand_id);
create index if not exists leads_brand_id_idx on leads (brand_id);

alter table tasks enable row level security;
alter table campaigns enable row level security;
alter table approvals enable row level security;
alter table agent_runs enable row level security;
alter table memory_items enable row level security;
alter table audit_log enable row level security;
alter table assets enable row level security;
alter table leads enable row level security;

-- Tenant isolation: session must `select set_config('app.brand_id', '<BRAND_ID>', true)`
-- before querying. The service role bypasses RLS — application code must still
-- pass brand_id on every query (same contract as MemoryOpsStore / FileOpsStore).
drop policy if exists brand_isolation_tasks on tasks;
create policy brand_isolation_tasks on tasks
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_campaigns on campaigns;
create policy brand_isolation_campaigns on campaigns
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_approvals on approvals;
create policy brand_isolation_approvals on approvals
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_agent_runs on agent_runs;
create policy brand_isolation_agent_runs on agent_runs
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_memory_items on memory_items;
create policy brand_isolation_memory_items on memory_items
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_audit_log on audit_log;
create policy brand_isolation_audit_log on audit_log
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_assets on assets;
create policy brand_isolation_assets on assets
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_leads on leads;
create policy brand_isolation_leads on leads
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table campaigns is 'Wave 3 campaign drafts. live_publish/live_ads are never stored as true here.';
comment on table approvals is 'Level ≤1 inbox is PENDING + LEVEL_0/LEVEL_1. Approving does not publish.';
