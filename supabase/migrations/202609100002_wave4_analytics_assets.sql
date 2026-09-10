-- Marketing OS Wave 4 — asset metadata + read-only analytics + AI visibility
-- Apply after 202609100001_phase4a_ops.sql when a Supabase project is provisioned.
-- Local/CI uses File/Memory catalogs and fixture analytics adapters.
-- Live publish/ads remain gated. No write scopes on analytics providers.

alter table if exists assets
  add column if not exists kind text not null default 'IMAGE'
    check (kind in ('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER')),
  add column if not exists approval_status text not null default 'DRAFT'
    check (approval_status in ('DRAFT', 'APPROVED', 'ARCHIVED')),
  add column if not exists usage_tags text[] not null default '{}',
  add column if not exists platform_suitability text[] not null default '{}',
  add column if not exists knowledge_status text not null default 'UNVERIFIED'
    check (knowledge_status in ('MISSING', 'UNVERIFIED', 'VERIFIED', 'CONFLICTING', 'STALE')),
  add column if not exists in_git boolean not null default false,
  add column if not exists checksum_sha256 text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists assets
  add constraint assets_storage_uri_not_git
  check (storage_uri ~* '^(mos|s3|gs|https)://');

create table if not exists asset_usage (
  usage_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  asset_id uuid not null references assets(asset_id),
  used_at timestamptz not null default now(),
  channel text,
  campaign_id uuid references campaigns(campaign_id),
  note text
);

create table if not exists analytics_daily (
  row_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  provider text not null check (provider in ('GA4', 'GSC', 'SOCIAL', 'ADS')),
  metric_key text not null,
  value numeric not null default 0,
  unit text not null default 'count',
  period_start timestamptz not null,
  period_end timestamptz not null,
  knowledge_status text not null default 'MISSING'
    check (knowledge_status in ('MISSING', 'UNVERIFIED')),
  utm jsonb,
  utm_valid boolean not null default false,
  write_scopes text[] not null default '{}'
    check (write_scopes = '{}'),
  created_at timestamptz not null default now()
);

create table if not exists marketing_costs (
  cost_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  provider text not null check (provider in ('GA4', 'GSC', 'SOCIAL', 'ADS')),
  amount numeric not null default 0,
  currency text not null default 'AED',
  knowledge_status text not null default 'MISSING'
    check (knowledge_status in ('MISSING', 'UNVERIFIED')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  write_scopes text[] not null default '{}'
    check (write_scopes = '{}'),
  created_at timestamptz not null default now()
);

create table if not exists ai_search_probes (
  probe_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  question text not null,
  surface text not null check (surface in ('CHATGPT', 'PERPLEXITY', 'GOOGLE_AI_OVERVIEW', 'OTHER')),
  presence text not null check (presence in ('PRESENT', 'ABSENT', 'UNCLEAR')),
  observation jsonb not null,
  recommendations jsonb not null default '[]'::jsonb,
  source_type text not null default 'AI_INFERENCE',
  live_probe boolean not null default false check (live_probe = false),
  invented_verified_claims boolean not null default false check (invented_verified_claims = false),
  mode text not null default 'FIXTURE' check (mode in ('FIXTURE', 'STUB')),
  observed_at timestamptz not null default now()
);

create index if not exists asset_usage_brand_id_idx on asset_usage (brand_id, asset_id);
create index if not exists analytics_daily_brand_id_idx on analytics_daily (brand_id, provider, period_start desc);
create index if not exists marketing_costs_brand_id_idx on marketing_costs (brand_id, period_start desc);
create index if not exists ai_search_probes_brand_id_idx on ai_search_probes (brand_id, observed_at desc);
create index if not exists assets_brand_tags_idx on assets (brand_id, approval_status);

alter table asset_usage enable row level security;
alter table analytics_daily enable row level security;
alter table marketing_costs enable row level security;
alter table ai_search_probes enable row level security;

drop policy if exists brand_isolation_asset_usage on asset_usage;
create policy brand_isolation_asset_usage on asset_usage
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_analytics_daily on analytics_daily;
create policy brand_isolation_analytics_daily on analytics_daily
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_marketing_costs on marketing_costs;
create policy brand_isolation_marketing_costs on marketing_costs
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_ai_search_probes on ai_search_probes;
create policy brand_isolation_ai_search_probes on ai_search_probes
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table assets is 'Wave 4 metadata catalog. Binaries are object-storage URIs; in_git must stay false.';
comment on table analytics_daily is 'Read-only analytics stubs. write_scopes must remain empty.';
comment on table ai_search_probes is 'Read-only AI search visibility fixtures. live_probe stays false; no VERIFIED commercial claims.';
