-- Wave 7 — CRM leads + attribution with opaque pii_ref.
-- Local/CI default remains the file/memory ops store.
-- Do not store raw email/phone. live_publish / live_ads stay false.

alter table if exists leads
  add column if not exists utm jsonb not null default '{}'::jsonb;

alter table if exists leads
  add column if not exists updated_at timestamptz not null default now();

create table if not exists lead_events (
  event_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  lead_id uuid not null references leads(lead_id),
  pii_ref text not null,
  kind text not null
    check (kind in ('INGESTED', 'ATTRIBUTED', 'STAGE_CHANGED', 'NOTE')),
  source text,
  campaign_id uuid references campaigns(campaign_id),
  utm jsonb not null default '{}'::jsonb,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists opportunities (
  opportunity_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  lead_id uuid not null references leads(lead_id),
  pii_ref text not null,
  campaign_id uuid references campaigns(campaign_id),
  stage text not null default 'OPEN'
    check (stage in ('OPEN', 'WON', 'LOST')),
  created_at timestamptz not null default now()
);

create index if not exists leads_brand_campaign_idx
  on leads (brand_id, campaign_id, created_at desc);

create index if not exists lead_events_brand_id_idx
  on lead_events (brand_id, created_at desc);

create index if not exists lead_events_lead_id_idx
  on lead_events (lead_id, created_at desc);

create index if not exists opportunities_brand_id_idx
  on opportunities (brand_id, created_at desc);

alter table lead_events enable row level security;
alter table opportunities enable row level security;

drop policy if exists brand_isolation_lead_events on lead_events;
create policy brand_isolation_lead_events on lead_events
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_opportunities on opportunities;
create policy brand_isolation_opportunities on opportunities
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table leads is
  'Wave 7 CRM leads. Store opaque pii_ref only — never raw email/phone.';
comment on table lead_events is
  'Wave 7 lead lifecycle events. Messages must stay PII-safe.';
comment on table opportunities is
  'Wave 7 opportunities linked to a lead + optional campaign. pii_ref only.';
