-- Marketing OS Phase 4a — Ops data plane (Wave 3)
-- RLS by brand_id. Apply only after Supabase project is provisioned.
-- Live integrations remain gated by reports/agency/PHASE_GATES.json.

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
  objective text not null,
  assigned_agent text,
  workflow_state text not null default 'IDEA',
  approval_level text not null default 'LEVEL_1',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  campaign_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  pack_id uuid,
  objective text not null,
  status text not null default 'DRAFT',
  pack jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  approval_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  task_id uuid references tasks(task_id),
  level text not null,
  decision text not null default 'PENDING',
  rationale text,
  actor text,
  created_at timestamptz not null default now()
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

alter table tasks enable row level security;
alter table campaigns enable row level security;
alter table approvals enable row level security;
alter table agent_runs enable row level security;
alter table memory_items enable row level security;
alter table audit_log enable row level security;
alter table assets enable row level security;
alter table leads enable row level security;

-- Example tenant policy pattern (service role bypasses RLS):
-- create policy brand_isolation_tasks on tasks
--   for all using (brand_id = current_setting('app.brand_id', true));
