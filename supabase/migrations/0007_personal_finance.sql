-- 0007_personal_finance.sql
-- Personal finance section for the owner. Fully separate from cafe tables.
-- Owner-only (RLS via public.is_owner()). Location-scoped.

-- Monthly budget lines: income / expense / wife-detail
create table if not exists finance_budget_lines (
  id           uuid primary key default uuid_generate_v4(),
  location_id  uuid not null references locations(id) on delete cascade,
  month        text not null,                       -- 'YYYY-MM'
  section      text not null check (section in ('income','expense','wife')),
  label        text not null default '',
  amount       numeric(14,2) not null default 0,
  checked      boolean not null default false,
  note         text,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_fin_budget_month on finance_budget_lines(location_id, month, section);

-- People we owe
create table if not exists finance_people (
  id              uuid primary key default uuid_generate_v4(),
  location_id     uuid not null references locations(id) on delete cascade,
  name            text not null default '',
  original_amount numeric(14,2) not null default 0,
  note            text,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fin_people_loc on finance_people(location_id);

-- Payments against a person's debt
create table if not exists finance_payments (
  id          uuid primary key default uuid_generate_v4(),
  location_id uuid not null references locations(id) on delete cascade,
  person_id   uuid not null references finance_people(id) on delete cascade,
  amount      numeric(14,2) not null default 0,
  paid_on     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_fin_pay_person on finance_payments(person_id);

-- Installment plans
create table if not exists finance_installments (
  id                 uuid primary key default uuid_generate_v4(),
  location_id        uuid not null references locations(id) on delete cascade,
  name               text not null default '',
  group_name         text,
  total              numeric(14,2) not null default 0,
  installments_count int not null default 1,
  start_month        text,                           -- 'YYYY-MM'
  paid_count         int not null default 0,
  note               text,
  position           int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_fin_inst_loc on finance_installments(location_id);

-- updated_at triggers
create trigger trg_fin_budget_updated before update on finance_budget_lines for each row execute function set_updated_at();
create trigger trg_fin_people_updated before update on finance_people for each row execute function set_updated_at();
create trigger trg_fin_inst_updated before update on finance_installments for each row execute function set_updated_at();

-- RLS: owner only
alter table finance_budget_lines enable row level security;
alter table finance_people       enable row level security;
alter table finance_payments     enable row level security;
alter table finance_installments enable row level security;

drop policy if exists "owners_fin_budget" on finance_budget_lines;
create policy "owners_fin_budget" on finance_budget_lines for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owners_fin_people" on finance_people;
create policy "owners_fin_people" on finance_people for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owners_fin_payments" on finance_payments;
create policy "owners_fin_payments" on finance_payments for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists "owners_fin_inst" on finance_installments;
create policy "owners_fin_inst" on finance_installments for all using (public.is_owner()) with check (public.is_owner());
