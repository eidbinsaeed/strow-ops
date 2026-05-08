-- Strow Ops — Schema v1
-- Initial migration: core tables for Phase 1 (barista flow) + Phase 2 (owner basics).
-- All transactional tables include location_id FK from day 1 (multi-location ready).
-- All tables have RLS enabled; policies are added in 0002_rls_policies.sql.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type submission_status as enum (
  'pending_review',  -- AI flagged, awaiting owner decision
  'confirmed',       -- approved (auto for high-confidence, manual for flagged)
  'flagged',         -- explicitly flagged by owner for follow-up
  'rejected'         -- rejected by owner
);

create type payment_method as enum (
  'cash',
  'card',
  'bank_transfer',
  'credit'
);

create type fixed_cost_kind as enum (
  'salary',
  'rent',
  'utility',
  'subscription',
  'other'
);

create type cost_frequency as enum (
  'monthly',
  'quarterly',
  'annual',
  'one_time'
);

create type liability_kind as enum (
  'customer_held',     -- customer money kept overnight
  'iou',               -- we owe someone
  'deferred_payment'   -- payment we've deferred
);

create type liability_status as enum (
  'open',
  'settled'
);

create type actor_type as enum (
  'barista',
  'owner',
  'system'
);

-- ============================================================================
-- HELPERS
-- ============================================================================

-- updated_at auto-update trigger function (reused on every table)
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- LOCATIONS
-- ============================================================================

create table locations (
  id           uuid primary key default uuid_generate_v4(),
  slug         text not null unique,
  name         text not null,
  timezone     text not null default 'Asia/Dubai',
  currency     text not null default 'AED',
  vat_rate     numeric(5,4) not null default 0.0500,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_locations_updated_at
  before update on locations
  for each row execute function set_updated_at();

comment on table locations is 'Physical locations under one owner account (Qave, future pizza, future bakery).';

-- Seed Phase 1 location
insert into locations (slug, name) values ('qave_main', 'Qave Cafe — Main');

-- ============================================================================
-- OWNERS
-- ============================================================================

-- Owners use Supabase Auth. This table mirrors auth.users for app-level joins.
create table owners (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_owners_updated_at
  before update on owners
  for each row execute function set_updated_at();

comment on table owners is 'App-level owner records, joined to Supabase Auth users.';

-- ============================================================================
-- BARISTAS
-- ============================================================================

create table baristas (
  id              uuid primary key default uuid_generate_v4(),
  location_id     uuid not null references locations(id) on delete restrict,
  name            text not null,
  pin_hash        text not null,
  is_active       boolean not null default true,
  is_on_shift     boolean not null default false,
  role            text not null default 'barista',
  salary          numeric(12,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_baristas_location on baristas(location_id);
create index idx_baristas_active   on baristas(is_active) where is_active = true;

create trigger trg_baristas_updated_at
  before update on baristas
  for each row execute function set_updated_at();

comment on column baristas.pin_hash is 'bcrypt hash of 4-digit PIN. Owner sets/rotates from dashboard.';
comment on column baristas.is_on_shift is 'Toggled by owner; only on-shift baristas can submit.';

-- ============================================================================
-- CATEGORIES
-- ============================================================================

create table categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  parent_id   uuid references categories(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_categories_parent on categories(parent_id);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

-- Seed common Qave categories
insert into categories (name) values
  ('Beverage Ingredients'),
  ('Resale / Bakery'),
  ('Packaging'),
  ('Equipment'),
  ('Cleaning Supplies'),
  ('Utilities'),
  ('Rent'),
  ('Salaries'),
  ('Software / Subscriptions'),
  ('Maintenance'),
  ('Other');

-- ============================================================================
-- SUPPLIERS
-- ============================================================================

create table suppliers (
  id            uuid primary key default uuid_generate_v4(),
  location_id   uuid not null references locations(id) on delete restrict,
  name          text not null,
  trn           text,                    -- UAE Tax Registration Number
  category_id   uuid references categories(id) on delete set null,
  contact       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (location_id, name)
);

create index idx_suppliers_location on suppliers(location_id);
create index idx_suppliers_category on suppliers(category_id);

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function set_updated_at();

comment on column suppliers.trn is 'UAE Tax Registration Number (15 digits). Optional; informal cash suppliers may not have one.';

-- ============================================================================
-- CLOSINGS (end-of-day reconciliation)
-- ============================================================================

create table closings (
  id                  uuid primary key default uuid_generate_v4(),
  location_id         uuid not null references locations(id) on delete restrict,
  closing_date        date not null,
  barista_id          uuid not null references baristas(id) on delete restrict,

  -- Sales totals (raw extraction from POS sheet)
  cash_total          numeric(12,2) not null default 0,
  card_total          numeric(12,2) not null default 0,
  online_total        numeric(12,2) not null default 0,
  grand_total         numeric(12,2) generated always as
                        (cash_total + card_total + online_total) stored,

  -- Cash drawer reconciliation
  cash_float_start    numeric(12,2) not null default 0,
  cash_float_end      numeric(12,2) not null default 0,
  over_short          numeric(12,2) generated always as
                        (cash_float_end - cash_float_start - cash_total) stored,

  -- Liabilities held overnight (e.g. customer money to refund tomorrow)
  liabilities_held    numeric(12,2) not null default 0,

  -- Photo evidence (Drive primary per D6, no Supabase Storage)
  photo_drive_url     text,                    -- "Open in Drive" link
  photo_drive_path    text,                    -- /Strow/[Location]/[YYYY-MM]/closings/...

  -- AI extraction metadata
  raw_date_string     text,                    -- preserve original date as written
  ai_confidence       jsonb,                   -- per-field self-rated confidence
  ai_anomalies        jsonb,                   -- AI-detected anomalies (math mismatch, future date, etc.)

  -- Workflow
  status              submission_status not null default 'pending_review',
  notes               text,

  -- Forward hooks (Phase 2+)
  pos_external_id     text,                    -- for Foodics/POS integration
  bank_settlement_id  uuid,                    -- for bank reconciliation
  shift_id            uuid,                    -- for staff time tracking

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One closing per location per date (prevents duplicate submissions)
  unique (location_id, closing_date)
);

create index idx_closings_location_date on closings(location_id, closing_date desc);
create index idx_closings_status        on closings(status);
create index idx_closings_barista       on closings(barista_id);

create trigger trg_closings_updated_at
  before update on closings
  for each row execute function set_updated_at();

comment on column closings.raw_date_string is 'Original date string from receipt before normalization (handles DD-MM/MM-DD ambiguity).';
comment on column closings.ai_confidence is 'JSONB { field_name: 0.0-1.0 } from extraction prompt self-rating.';

-- ============================================================================
-- EXPENSES
-- ============================================================================

create table expenses (
  id                  uuid primary key default uuid_generate_v4(),
  location_id         uuid not null references locations(id) on delete restrict,
  barista_id          uuid not null references baristas(id) on delete restrict,
  expense_date        date not null,
  supplier_id         uuid references suppliers(id) on delete set null,
  category_id         uuid references categories(id) on delete set null,

  invoice_number      text,                    -- duplicate detection key per supplier
  subtotal            numeric(12,2) not null default 0,
  vat_amount          numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  payment_method      payment_method not null default 'cash',

  -- Photo evidence (Drive primary per D6)
  photo_drive_url     text,
  photo_drive_path    text,

  -- AI extraction metadata
  raw_date_string     text,
  ai_confidence       jsonb,
  ai_anomalies        jsonb,

  -- Workflow
  status              submission_status not null default 'pending_review',
  notes               text,

  -- Forward hooks (Phase 2+)
  bank_settlement_id  uuid,
  shift_id            uuid,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Duplicate detection: same supplier + same invoice number = same invoice
-- Allow nulls (informal cash receipts may not have invoice numbers)
create unique index uniq_expense_supplier_invoice
  on expenses(supplier_id, invoice_number)
  where supplier_id is not null and invoice_number is not null;

create index idx_expenses_location_date on expenses(location_id, expense_date desc);
create index idx_expenses_supplier      on expenses(supplier_id);
create index idx_expenses_category      on expenses(category_id);
create index idx_expenses_status        on expenses(status);
create index idx_expenses_barista       on expenses(barista_id);

create trigger trg_expenses_updated_at
  before update on expenses
  for each row execute function set_updated_at();

-- ============================================================================
-- EXPENSE LINE ITEMS
-- ============================================================================

create table expense_line_items (
  id                  uuid primary key default uuid_generate_v4(),
  expense_id          uuid not null references expenses(id) on delete cascade,
  description         text not null,
  quantity            numeric(12,3) not null default 1,
  unit_price          numeric(12,2) not null default 0,
  line_total          numeric(12,2) not null default 0,
  inventory_item_id   uuid,                    -- forward hook for Phase 2 COGS
  position            int not null default 0,  -- display order
  created_at          timestamptz not null default now()
);

create index idx_line_items_expense on expense_line_items(expense_id);

comment on column expense_line_items.inventory_item_id is 'Forward hook: Phase 2 will add inventory_items table and FK this column.';

-- ============================================================================
-- FIXED COSTS
-- ============================================================================

create table fixed_costs (
  id                  uuid primary key default uuid_generate_v4(),
  location_id         uuid not null references locations(id) on delete restrict,
  name                text not null,
  kind                fixed_cost_kind not null,
  amount              numeric(12,2) not null,
  frequency           cost_frequency not null default 'monthly',
  due_day             int,                     -- day of month (1-28 safe range)
  is_active           boolean not null default true,
  linked_barista_id   uuid references baristas(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (due_day is null or (due_day >= 1 and due_day <= 31))
);

create index idx_fixed_costs_location on fixed_costs(location_id);
create index idx_fixed_costs_active   on fixed_costs(is_active) where is_active = true;

create trigger trg_fixed_costs_updated_at
  before update on fixed_costs
  for each row execute function set_updated_at();

comment on column fixed_costs.linked_barista_id is 'For salary fixed costs, link to barista record so salary changes flow through.';

-- ============================================================================
-- LIABILITIES (IOUs, customer money held, deferred payments)
-- ============================================================================

create table liabilities (
  id              uuid primary key default uuid_generate_v4(),
  location_id     uuid not null references locations(id) on delete restrict,
  incurred_date   date not null,
  counterparty    text not null,
  amount          numeric(12,2) not null,
  kind            liability_kind not null,
  status          liability_status not null default 'open',
  settled_date    date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status = 'open' or settled_date is not null)
);

create index idx_liabilities_location_status on liabilities(location_id, status);
create index idx_liabilities_status_date     on liabilities(status, incurred_date desc);

create trigger trg_liabilities_updated_at
  before update on liabilities
  for each row execute function set_updated_at();

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

create table audit_log (
  id            uuid primary key default uuid_generate_v4(),
  actor_id      uuid,                          -- barista_id or owner_id; nullable for system
  actor_type    actor_type not null,
  action        text not null,                 -- 'created', 'updated', 'confirmed', 'rejected', etc.
  entity_type   text not null,                 -- 'closing', 'expense', 'supplier', etc.
  entity_id     uuid not null,
  before_state  jsonb,
  after_state   jsonb,
  created_at    timestamptz not null default now()
);

create index idx_audit_entity      on audit_log(entity_type, entity_id);
create index idx_audit_actor       on audit_log(actor_id);
create index idx_audit_created_at  on audit_log(created_at desc);

comment on table audit_log is 'Immutable record of every meaningful state change. Never UPDATE or DELETE.';

-- ============================================================================
-- INVENTORY ITEMS (stub for Phase 2)
-- ============================================================================

create table inventory_items (
  id              uuid primary key default uuid_generate_v4(),
  location_id     uuid not null references locations(id) on delete restrict,
  name            text not null,
  unit            text,                        -- e.g. 'kg', 'L', 'each'
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inventory_items_updated_at
  before update on inventory_items
  for each row execute function set_updated_at();

comment on table inventory_items is 'Phase 2 stub. Empty in v1. Allows expense_line_items.inventory_item_id to FK without Phase 2 migration.';

-- Now wire the forward-hook FK
alter table expense_line_items
  add constraint fk_line_items_inventory
  foreign key (inventory_item_id) references inventory_items(id) on delete set null;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================
-- Policies defined in 0002_rls_policies.sql

alter table locations           enable row level security;
alter table owners              enable row level security;
alter table baristas            enable row level security;
alter table categories          enable row level security;
alter table suppliers           enable row level security;
alter table closings            enable row level security;
alter table expenses            enable row level security;
alter table expense_line_items  enable row level security;
alter table fixed_costs         enable row level security;
alter table liabilities         enable row level security;
alter table audit_log           enable row level security;
alter table inventory_items     enable row level security;
