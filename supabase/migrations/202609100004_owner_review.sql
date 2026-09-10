-- Owner Review Loop — brand-scoped reviews + email outbox.
-- Local/CI default remains the file/memory ops store.
-- Live Resend is not required. Live publish/ads stay off.

alter table campaigns drop constraint if exists campaigns_status_check;
alter table campaigns add constraint campaigns_status_check
  check (status in (
    'DRAFT',
    'AWAITING_OWNER',
    'CHANGES_REQUESTED',
    'INTERNAL_APPROVED',
    'REJECTED',
    'BLOCKED'
  ));

create table if not exists owner_reviews (
  review_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  campaign_id uuid references campaigns(campaign_id),
  pack_id uuid not null,
  approval_id uuid references approvals(approval_id),
  token text not null unique,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'CHANGES_REQUESTED')),
  review_url text not null,
  template text not null default 'MATERIALS_READY',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists owner_decisions (
  decision_id uuid primary key default gen_random_uuid(),
  review_id uuid not null references owner_reviews(review_id),
  brand_id text not null references brands(brand_id),
  decision text not null
    check (decision in ('APPROVED', 'CHANGES_REQUESTED')),
  note text not null default '',
  actor text not null,
  revision_task_id uuid references tasks(task_id),
  guardian jsonb,
  created_at timestamptz not null default now()
);

create table if not exists email_outbox (
  outbox_id uuid primary key default gen_random_uuid(),
  brand_id text not null references brands(brand_id),
  template text not null,
  mode text not null default 'dry_run',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'RECORDED',
  live_publish boolean not null default false check (live_publish = false),
  live_ads boolean not null default false check (live_ads = false),
  created_at timestamptz not null default now()
);

create index if not exists owner_reviews_brand_id_idx on owner_reviews (brand_id, created_at desc);
create index if not exists owner_decisions_brand_id_idx on owner_decisions (brand_id, created_at desc);
create index if not exists email_outbox_brand_id_idx on email_outbox (brand_id, created_at desc);

alter table owner_reviews enable row level security;
alter table owner_decisions enable row level security;
alter table email_outbox enable row level security;

drop policy if exists brand_isolation_owner_reviews on owner_reviews;
create policy brand_isolation_owner_reviews on owner_reviews
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_owner_decisions on owner_decisions;
create policy brand_isolation_owner_decisions on owner_decisions
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

drop policy if exists brand_isolation_email_outbox on email_outbox;
create policy brand_isolation_email_outbox on email_outbox
  for all
  using (brand_id = current_setting('app.brand_id', true))
  with check (brand_id = current_setting('app.brand_id', true));

comment on table owner_reviews is 'Tokenized brand-owner materials review. Approving does not publish or spend.';
comment on table email_outbox is 'Templated owner emails. dry_run records only; live_ads stays false.';
