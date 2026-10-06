-- 0019_pos_reports.sql
-- POS daily reports (EZI POS "Report Qavé Café_<date>.xlsx", emailed by ezi.pos.cloud@gmail.com),
-- imported automatically every morning by a scheduled task:
--   Gmail raw email -> pos_report.py (parses the xlsx, reconciles every total)
--   -> public.pos_import_report(jsonb) (re-checks a checksum + totals, then stores it).
-- One report per business date: a newer report for the same date replaces the older one,
-- the same or an older one is skipped.
-- Also: POS vs barista closing check (fills only blank order counts / app split when the totals
-- match; a mismatch becomes a "Needs you" item), POS products matched to recipes, and
-- theoretical ingredient use per day (sales x recipes).
-- Additive only: nothing existing is altered except a new nullable column menu_items.pos_name.

-- ---------------------------------------------------------------- helpers
create or replace function public.pos_norm(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', ' ', 'g')), '')
$$;
comment on function public.pos_norm(text) is 'Name key for matching POS products to menu items: lower case, emoji/punctuation removed, single spaces.';

create or replace function public.pos_method(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when t ~* 'cash' then 'cash'
    when t ~* '(card|visa|master|mada|amex)' then 'card'
    when t ~* 'talabat' then 'talabat'
    when t ~* 'k(a)?ee?ta' then 'keeta'
    when t ~* 'beanz' then 'beanz'
    else 'other'
  end
$$;
comment on function public.pos_method(text) is 'POS payment method name -> closings column family: cash, card, talabat, keeta, beanz, other.';

alter table public.menu_items add column if not exists pos_name text;
comment on column public.menu_items.pos_name is 'Product name in the POS when it differs from name. Matching ignores case, spaces, emoji and punctuation.';

-- ---------------------------------------------------------------- tables
create table if not exists public.pos_daily_reports (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references public.locations(id),
  business_date     date not null,
  generated_at      timestamptz not null,
  store_name        text,
  source            text not null default 'email' check (source in ('email', 'upload', 'manual')),
  source_message_id text,
  file_sha256       text,
  orders_paid       integer not null check (orders_paid >= 0),
  orders_refunded   integer not null default 0,
  product_amount    numeric not null default 0,
  addon_amount      numeric not null default 0,
  discount_total    numeric not null default 0,
  tax_total         numeric not null default 0,
  total_paid        numeric not null,
  total_refund      numeric not null default 0,
  net_sales         numeric not null,
  actual_sales      numeric not null,
  cash_total        numeric not null default 0,
  card_total        numeric not null default 0,
  talabat_total     numeric not null default 0,
  keeta_total       numeric not null default 0,
  beanz_total       numeric not null default 0,
  other_total       numeric not null default 0,
  orders_by_method  jsonb not null default '{}'::jsonb,
  payments          jsonb not null default '[]'::jsonb,
  fees              jsonb not null default '[]'::jsonb,
  staff             jsonb not null default '[]'::jsonb,
  special           jsonb not null default '[]'::jsonb,
  closing_check     jsonb,
  raw               jsonb not null,
  imported_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (location_id, business_date)
);
comment on table public.pos_daily_reports is 'One POS daily report per business date (imported from the POS email). total_paid = what the POS took in; discount_total = comps/discounts given (positive); orders_by_method has the same shape as closings.transactions_by_method; closing_check = POS vs barista closing (state match / mismatch / no_closing / report_before_closing).';

create table if not exists public.pos_product_sales (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.pos_daily_reports(id) on delete cascade,
  location_id   uuid not null references public.locations(id),
  business_date date not null,
  product       text not null,
  variant       text,
  is_total      boolean not null default false,
  qty           numeric not null,
  gross         numeric not null default 0,
  discount      numeric not null default 0,
  net           numeric not null default 0,
  tax           numeric not null default 0,
  total         numeric not null default 0,
  refund        numeric not null default 0,
  position      integer not null default 0
);
comment on table public.pos_product_sales is 'Sales per POS product per day. A product sold in variants (Croissant: Plain / Cheese) has one is_total=true row plus one row per variant; count only rows where is_total = false.';
create index if not exists idx_pos_product_sales_date on public.pos_product_sales (location_id, business_date);
create index if not exists idx_pos_product_sales_report on public.pos_product_sales (report_id);

create table if not exists public.pos_category_sales (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.pos_daily_reports(id) on delete cascade,
  location_id   uuid not null references public.locations(id),
  business_date date not null,
  category      text not null,
  qty           numeric not null,
  gross         numeric not null default 0,
  discount      numeric not null default 0,
  net           numeric not null default 0,
  tax           numeric not null default 0,
  total         numeric not null default 0,
  refund        numeric not null default 0,
  position      integer not null default 0
);
create index if not exists idx_pos_category_sales_report on public.pos_category_sales (report_id);

create table if not exists public.pos_modifier_sales (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.pos_daily_reports(id) on delete cascade,
  location_id   uuid not null references public.locations(id),
  business_date date not null,
  modifier      text not null,
  option        text not null,
  qty           numeric not null,
  position      integer not null default 0
);
create index if not exists idx_pos_modifier_sales_report on public.pos_modifier_sales (report_id);

create table if not exists public.pos_orders (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.pos_daily_reports(id) on delete cascade,
  location_id    uuid not null references public.locations(id),
  business_date  date not null,
  order_id       text not null,
  paid_at        timestamptz,
  take_up_number text,
  total_paid     numeric not null,
  product_qty    numeric,
  product_amount numeric,
  order_discount numeric not null default 0,
  payment_method text,
  payments       jsonb not null default '[]'::jsonb,
  items          jsonb not null default '[]'::jsonb,
  staff          text,
  order_type     text,
  status         text,
  unique (location_id, order_id)
);
comment on table public.pos_orders is 'Every paid POS order: time, payment method (cash/card/talabat/keeta/beanz/other, mixed, none), items [{name, spec, qty}], order_discount (negative = discount given).';
create index if not exists idx_pos_orders_date on public.pos_orders (location_id, business_date);
create index if not exists idx_pos_orders_report on public.pos_orders (report_id);

drop trigger if exists trg_pos_daily_reports_updated_at on public.pos_daily_reports;
create trigger trg_pos_daily_reports_updated_at before update on public.pos_daily_reports
  for each row execute function public.set_updated_at();

alter table public.pos_daily_reports enable row level security;
alter table public.pos_product_sales enable row level security;
alter table public.pos_category_sales enable row level security;
alter table public.pos_modifier_sales enable row level security;
alter table public.pos_orders enable row level security;

drop policy if exists owners_full_access_pos_daily_reports on public.pos_daily_reports;
create policy owners_full_access_pos_daily_reports on public.pos_daily_reports for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists owners_full_access_pos_product_sales on public.pos_product_sales;
create policy owners_full_access_pos_product_sales on public.pos_product_sales for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists owners_full_access_pos_category_sales on public.pos_category_sales;
create policy owners_full_access_pos_category_sales on public.pos_category_sales for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists owners_full_access_pos_modifier_sales on public.pos_modifier_sales;
create policy owners_full_access_pos_modifier_sales on public.pos_modifier_sales for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists owners_full_access_pos_orders on public.pos_orders;
create policy owners_full_access_pos_orders on public.pos_orders for all using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- import
create or replace function public.pos_import_report(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sum      jsonb := p -> 'sum';
  v_loc      uuid;
  v_date     date;
  v_gen      timestamptz;
  v_n        bigint;
  v_s        numeric;
  v_c        bigint;
  v_k        numeric;
  v_old      record;
  v_cl       record;
  v_id       uuid;
  v_status   text;
  v_by       jsonb;
  v_cash     numeric;
  v_card     numeric;
  v_tal      numeric;
  v_kee      numeric;
  v_bea      numeric;
  v_oth      numeric;
  v_paid     numeric;
  v_apps     numeric;
  v_diff     numeric;
  v_check    jsonb;
  v_fill     jsonb := '{}'::jsonb;
  v_title    text;
  v_detail   text;
  v_matched  integer;
  v_lines    integer;
begin
  if coalesce(p ->> 'v', '') <> '1' then
    raise exception 'pos_import_report: unsupported payload version %', p ->> 'v';
  end if;

  -- 1. Transport check: every number and every text must arrive exactly as the parser produced them.
  --    n = how many numbers, s = their sum, c = characters of text, k = every character's code x its position.
  select count(*) filter (where jsonb_typeof(x) = 'number'),
         coalesce(sum((x #>> '{}')::numeric) filter (where jsonb_typeof(x) = 'number'), 0),
         coalesce(sum(length(x #>> '{}')) filter (where jsonb_typeof(x) = 'string'), 0),
         coalesce(sum(w.k) filter (where jsonb_typeof(x) = 'string'), 0)
    into v_n, v_s, v_c, v_k
    from jsonb_path_query(p - 'chk', 'strict $.**') as x
    left join lateral (
      select sum(ascii(ch)::numeric * i) as k
        from regexp_split_to_table(case when jsonb_typeof(x) = 'string' then x #>> '{}' end, '') with ordinality as t(ch, i)
    ) w on true;
  if p -> 'chk' is null
     or v_n <> (p #>> '{chk,n}')::bigint
     or abs(round(v_s, 2) - (p #>> '{chk,s}')::numeric) > 0.005
     or v_c <> (p #>> '{chk,c}')::bigint
     or v_k <> (p #>> '{chk,k}')::numeric then
    raise exception 'pos_import_report: checksum mismatch (got n=%, s=%, c=%, k=%; expected %) - the report changed in transit, send the file content again exactly',
      v_n, round(v_s, 2), v_c, v_k, p -> 'chk';
  end if;

  -- 2. The report must add up.
  v_date := (p ->> 'date')::date;
  v_gen  := (p ->> 'gen')::timestamp at time zone 'Asia/Dubai';
  v_paid := (v_sum ->> 'paid')::numeric;
  if abs((select coalesce(sum((e ->> 1)::numeric), 0) from jsonb_array_elements(p -> 'pay') e) - v_paid) > 0.01 then
    raise exception 'pos_import_report: payment methods do not add up to total paid %', v_paid;
  end if;
  if jsonb_array_length(p -> 'ord') <> (v_sum ->> 'orders')::int then
    raise exception 'pos_import_report: % orders listed but % paid orders reported', jsonb_array_length(p -> 'ord'), v_sum ->> 'orders';
  end if;
  if abs((select coalesce(sum((o ->> 3)::numeric), 0) from jsonb_array_elements(p -> 'ord') o) - v_paid) > 0.01 then
    raise exception 'pos_import_report: order totals do not add up to total paid %', v_paid;
  end if;

  select id into v_loc from locations where slug = 'qave_main';
  if v_loc is null then
    raise exception 'pos_import_report: location qave_main not found';
  end if;

  select jsonb_build_object(
           'card',    coalesce(sum(cnt) filter (where m = 'card'), 0),
           'cash',    coalesce(sum(cnt) filter (where m = 'cash'), 0),
           'beanz',   coalesce(sum(cnt) filter (where m = 'beanz'), 0),
           'keeta',   coalesce(sum(cnt) filter (where m = 'keeta'), 0),
           'other',   coalesce(sum(cnt) filter (where m = 'other'), 0),
           'talabat', coalesce(sum(cnt) filter (where m = 'talabat'), 0)),
         coalesce(sum(amt) filter (where m = 'cash'), 0),
         coalesce(sum(amt) filter (where m = 'card'), 0),
         coalesce(sum(amt) filter (where m = 'talabat'), 0),
         coalesce(sum(amt) filter (where m = 'keeta'), 0),
         coalesce(sum(amt) filter (where m = 'beanz'), 0),
         coalesce(sum(amt) filter (where m = 'other'), 0)
    into v_by, v_cash, v_card, v_tal, v_kee, v_bea, v_oth
    from (select public.pos_method(e ->> 0) as m, (e ->> 1)::numeric as amt, coalesce((e ->> 2)::int, 0) as cnt
            from jsonb_array_elements(p -> 'pay') e) x;

  -- 3. One report per day: newer replaces older, same or older is skipped.
  select id, generated_at into v_old from pos_daily_reports where location_id = v_loc and business_date = v_date;
  if found then
    if v_old.generated_at >= v_gen then
      return jsonb_build_object('status', 'skipped', 'date', v_date, 'report_id', v_old.id,
        'reason', case when v_old.generated_at = v_gen then 'this report is already imported'
                       else 'a newer report for this day is already imported' end);
    end if;
    delete from pos_product_sales where report_id = v_old.id;
    delete from pos_category_sales where report_id = v_old.id;
    delete from pos_modifier_sales where report_id = v_old.id;
    delete from pos_orders where report_id = v_old.id;
    v_id := v_old.id;
    v_status := 'replaced';
    update pos_daily_reports set
      generated_at = v_gen, store_name = p ->> 'store', source_message_id = p ->> 'msg', file_sha256 = p ->> 'sha',
      orders_paid = (v_sum ->> 'orders')::int, orders_refunded = coalesce((v_sum ->> 'refunded')::int, 0),
      product_amount = (v_sum ->> 'product')::numeric, addon_amount = (v_sum ->> 'addon')::numeric,
      discount_total = (v_sum ->> 'discount')::numeric, tax_total = (v_sum ->> 'tax')::numeric,
      total_paid = v_paid, total_refund = (v_sum ->> 'refund')::numeric, net_sales = (v_sum ->> 'net')::numeric,
      actual_sales = (v_sum ->> 'actual')::numeric,
      cash_total = v_cash, card_total = v_card, talabat_total = v_tal, keeta_total = v_kee, beanz_total = v_bea, other_total = v_oth,
      orders_by_method = v_by, payments = p -> 'pay', fees = p -> 'fees', staff = p -> 'staff', special = p -> 'special',
      closing_check = null, raw = p, imported_at = now()
    where id = v_id;
  else
    v_status := 'imported';
    insert into pos_daily_reports (
      location_id, business_date, generated_at, store_name, source, source_message_id, file_sha256,
      orders_paid, orders_refunded, product_amount, addon_amount, discount_total, tax_total,
      total_paid, total_refund, net_sales, actual_sales,
      cash_total, card_total, talabat_total, keeta_total, beanz_total, other_total,
      orders_by_method, payments, fees, staff, special, raw)
    values (
      v_loc, v_date, v_gen, p ->> 'store', case when p ->> 'msg' is null then 'upload' else 'email' end, p ->> 'msg', p ->> 'sha',
      (v_sum ->> 'orders')::int, coalesce((v_sum ->> 'refunded')::int, 0), (v_sum ->> 'product')::numeric, (v_sum ->> 'addon')::numeric,
      (v_sum ->> 'discount')::numeric, (v_sum ->> 'tax')::numeric,
      v_paid, (v_sum ->> 'refund')::numeric, (v_sum ->> 'net')::numeric, (v_sum ->> 'actual')::numeric,
      v_cash, v_card, v_tal, v_kee, v_bea, v_oth,
      v_by, p -> 'pay', p -> 'fees', p -> 'staff', p -> 'special', p)
    returning id into v_id;
  end if;

  insert into pos_category_sales (report_id, location_id, business_date, category, qty, gross, discount, net, tax, total, refund, position)
  select v_id, v_loc, v_date, e ->> 0, (e ->> 1)::numeric, (e ->> 2)::numeric, (e ->> 3)::numeric, (e ->> 4)::numeric,
         (e ->> 5)::numeric, (e ->> 6)::numeric, (e ->> 7)::numeric, (i - 1)::int
    from jsonb_array_elements(p -> 'cat') with ordinality as t(e, i);

  insert into pos_product_sales (report_id, location_id, business_date, product, variant, is_total, qty, gross, discount, net, tax, total, refund, position)
  select v_id, v_loc, v_date, e ->> 0, e ->> 1, coalesce((e ->> 2)::boolean, false), (e ->> 3)::numeric, (e ->> 4)::numeric,
         (e ->> 5)::numeric, (e ->> 6)::numeric, (e ->> 7)::numeric, (e ->> 8)::numeric, (e ->> 9)::numeric, (i - 1)::int
    from jsonb_array_elements(p -> 'prod') with ordinality as t(e, i);

  insert into pos_modifier_sales (report_id, location_id, business_date, modifier, option, qty, position)
  select v_id, v_loc, v_date, e ->> 0, e ->> 1, (e ->> 2)::numeric, (i - 1)::int
    from jsonb_array_elements(p -> 'mod') with ordinality as t(e, i);

  insert into pos_orders (report_id, location_id, business_date, order_id, paid_at, take_up_number, total_paid, product_qty,
                          product_amount, order_discount, payment_method, payments, items, staff, order_type, status)
  select v_id, v_loc, v_date, e ->> 0,
         case when e ->> 1 ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then (e ->> 1)::timestamp at time zone 'Asia/Dubai' end,
         e ->> 2, (e ->> 3)::numeric, (e ->> 4)::numeric, (e ->> 5)::numeric, coalesce((e ->> 6)::numeric, 0),
         (select case when count(*) = 0 then 'none'
                      when count(distinct public.pos_method(x ->> 0)) > 1 then 'mixed'
                      else min(public.pos_method(x ->> 0)) end
            from jsonb_array_elements(e -> 7) x),
         coalesce(e -> 7, '[]'::jsonb),
         (select coalesce(jsonb_agg(jsonb_build_object('name', it ->> 0, 'spec', it ->> 1, 'qty', (it ->> 2)::numeric)), '[]'::jsonb)
            from jsonb_array_elements(e -> 8) it),
         e ->> 9, e ->> 10, e ->> 11
    from jsonb_array_elements(p -> 'ord') e
  on conflict (location_id, order_id) do update set
    report_id = excluded.report_id, business_date = excluded.business_date, paid_at = excluded.paid_at,
    take_up_number = excluded.take_up_number, total_paid = excluded.total_paid, product_qty = excluded.product_qty,
    product_amount = excluded.product_amount, order_discount = excluded.order_discount, payment_method = excluded.payment_method,
    payments = excluded.payments, items = excluded.items, staff = excluded.staff, order_type = excluded.order_type, status = excluded.status;

  -- 4. POS vs the barista closing of the same day.
  select id, grand_total, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total,
         transactions, transactions_by_method, created_at
    into v_cl
    from closings
   where location_id = v_loc and closing_date = v_date and status <> 'rejected'
   order by created_at desc
   limit 1;
  v_apps := v_tal + v_kee + v_bea + v_oth;
  if not found then
    v_check := jsonb_build_object('state', 'no_closing');
  elsif v_gen < v_cl.created_at and v_gen < (v_date + 1)::timestamp at time zone 'Asia/Dubai'
        and v_paid - v_cl.grand_total <= 1 then
    -- Made before the closing: later orders may be missing from the POS report, so a lower POS total is expected.
    -- (If the POS already shows MORE than the closing, it is a real shortfall and falls through to the check below.)
    v_check := jsonb_build_object('state', 'report_before_closing', 'closing_id', v_cl.id,
      'pos_total', v_paid, 'closing_total', v_cl.grand_total,
      'note', 'The POS report was made before the closing was submitted, so it may not cover the whole day.');
  else
    v_diff := v_paid - v_cl.grand_total;
    v_check := jsonb_build_object(
      'state', case when abs(v_diff) <= 1 then 'match' else 'mismatch' end,
      'complete', v_gen >= v_cl.created_at or v_gen >= (v_date + 1)::timestamp at time zone 'Asia/Dubai',
      'closing_id', v_cl.id, 'pos_total', v_paid, 'closing_total', v_cl.grand_total, 'diff', v_diff,
      'cash', jsonb_build_object('pos', v_cash, 'closing', v_cl.cash_total),
      'card', jsonb_build_object('pos', v_card, 'closing', v_cl.card_total),
      'apps', jsonb_build_object('pos', v_apps, 'closing', v_cl.online_total),
      'orders', jsonb_build_object('pos', (v_sum ->> 'orders')::int, 'closing', v_cl.transactions));
    if abs(v_diff) <= 1 and (v_check ->> 'complete')::boolean then
      -- Same rule as the photo backfill: only fill what is blank, never overwrite.
      if v_cl.transactions is null then
        v_fill := v_fill || jsonb_build_object('transactions', (v_sum ->> 'orders')::int);
      end if;
      if v_cl.transactions_by_method is null then
        v_fill := v_fill || jsonb_build_object('transactions_by_method', v_by);
      end if;
      if v_cl.talabat_total is null and v_cl.keeta_total is null and v_cl.beanz_total is null
         and v_oth = 0 and abs(coalesce(v_cl.online_total, 0) - v_apps) <= 1 then
        v_fill := v_fill || jsonb_build_object('talabat_total', v_tal, 'keeta_total', v_kee, 'beanz_total', v_bea);
      end if;
      if v_fill <> '{}'::jsonb then
        update closings set
          transactions = coalesce(transactions, (v_fill ->> 'transactions')::int),
          transactions_by_method = coalesce(transactions_by_method, v_fill -> 'transactions_by_method'),
          talabat_total = case when v_fill ? 'talabat_total' then (v_fill ->> 'talabat_total')::numeric else talabat_total end,
          keeta_total = case when v_fill ? 'keeta_total' then (v_fill ->> 'keeta_total')::numeric else keeta_total end,
          beanz_total = case when v_fill ? 'beanz_total' then (v_fill ->> 'beanz_total')::numeric else beanz_total end
        where id = v_cl.id;
        insert into audit_log (actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
        values (null, 'system', 'filled_from_pos_report', 'closing', v_cl.id,
                jsonb_build_object('transactions', v_cl.transactions, 'transactions_by_method', v_cl.transactions_by_method,
                                   'talabat_total', v_cl.talabat_total, 'keeta_total', v_cl.keeta_total, 'beanz_total', v_cl.beanz_total),
                v_fill || jsonb_build_object('pos_report_id', v_id));
        v_check := v_check || jsonb_build_object('filled', v_fill);
      end if;
      update ai_actions set status = 'resolved', decided_at = now()
       where entity_table = 'closings' and entity_id = v_cl.id and status = 'info' and title like 'POS report vs closing%';
    elsif abs(v_diff) > 1 then
      v_title := format('POS report vs closing %s: POS AED %s, closing AED %s (%s)',
        to_char(v_date, 'DD Mon'), to_char(v_paid, 'FM999990.00'), to_char(v_cl.grand_total, 'FM999990.00'),
        case when v_diff > 0 then 'AED ' || to_char(v_diff, 'FM999990.00') || ' missing from the closing'
             else 'closing AED ' || to_char(-v_diff, 'FM999990.00') || ' higher than the POS' end);
      v_detail := format('Cash: POS %s vs closing %s. Card: POS %s vs closing %s. Apps (Talabat/Keeta/Beanz): POS %s vs closing %s. Orders: POS %s vs closing %s.',
        v_cash, coalesce(v_cl.cash_total::text, '-'), v_card, coalesce(v_cl.card_total::text, '-'),
        v_apps, coalesce(v_cl.online_total::text, '-'), v_sum ->> 'orders', coalesce(v_cl.transactions::text, '-'));
      update ai_actions set title = v_title, detail = v_detail, created_at = now()
       where entity_table = 'closings' and entity_id = v_cl.id and status = 'info' and title like 'POS report vs closing%';
      if not found then
        insert into ai_actions (source, status, severity, title, detail, confidence, entity_table, entity_id)
        values ('autopilot', 'info', case when abs(v_diff) >= 50 then 'critical' else 'warn' end, v_title, v_detail, 1, 'closings', v_cl.id);
      end if;
    end if;
  end if;
  update pos_daily_reports set closing_check = v_check where id = v_id;

  insert into audit_log (actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
  values (null, 'system', 'pos_report_' || v_status, 'pos_daily_report', v_id,
          case when v_status = 'replaced' then jsonb_build_object('generated_at', v_old.generated_at) end,
          jsonb_build_object('business_date', v_date, 'generated_at', v_gen, 'orders', (v_sum ->> 'orders')::int,
                             'total_paid', v_paid, 'source_message_id', p ->> 'msg', 'file_sha256', p ->> 'sha',
                             'closing', v_check ->> 'state'));

  select count(*), count(*) filter (where menu_item_id is not null) into v_lines, v_matched
    from v_pos_product_sales where report_id = v_id;

  return jsonb_build_object(
    'status', v_status, 'report_id', v_id, 'date', v_date, 'generated_at', v_gen,
    'orders', (v_sum ->> 'orders')::int, 'total_paid', v_paid,
    'products', v_lines, 'products_with_recipe', v_matched,
    'closing', v_check, 'warnings', coalesce(p -> 'warn', '[]'::jsonb));
end;
$$;

comment on function public.pos_import_report(jsonb) is 'Imports one parsed POS daily report (payload from pos_report.py). Verifies a checksum and the totals, keeps one report per business date (newer wins), checks it against the closing.';
revoke all on function public.pos_import_report(jsonb) from public;
revoke all on function public.pos_import_report(jsonb) from anon, authenticated;

-- ---------------------------------------------------------------- views
create or replace view public.v_pos_product_sales
with (security_invoker = true) as
select
  s.id,
  s.report_id,
  s.location_id,
  s.business_date,
  s.product,
  s.variant,
  s.qty,
  s.gross,
  s.discount,
  s.net,
  s.refund,
  m.id                       as menu_item_id,
  m.name                     as menu_item,
  c.cost                     as unit_cost,
  round(s.qty * c.cost, 2)   as recipe_cost,
  case
    when m.id is null then 'no_recipe'
    when c.costed_count < c.ingredient_count then 'partly_costed'
    else 'costed'
  end                        as cost_status
from public.pos_product_sales s
left join lateral (
  select mi.id, mi.name
    from public.menu_items mi
   where mi.location_id = s.location_id
     and public.pos_norm(coalesce(mi.pos_name, mi.name)) in (public.pos_norm(s.product || ' ' || coalesce(s.variant, '')), public.pos_norm(s.product))
   order by (public.pos_norm(coalesce(mi.pos_name, mi.name)) = public.pos_norm(s.product || ' ' || coalesce(s.variant, ''))) desc,
            mi.is_active desc
   limit 1
) m on true
left join public.v_menu_item_costs c on c.menu_item_id = m.id
where not s.is_total;

comment on view public.v_pos_product_sales is 'POS sales per product per day, matched to the recipe (menu item) by name, with recipe cost = qty x current recipe cost. cost_status: costed | partly_costed | no_recipe.';

create or replace view public.v_pos_ingredient_usage
with (security_invoker = true) as
select
  s.location_id,
  s.business_date,
  l.inventory_item_id,
  l.ingredient,
  l.base_uom,
  round(sum(s.qty * l.base_qty), 4)   as qty_used,
  round(sum(s.qty * l.line_cost), 2)  as cost
from public.v_pos_product_sales s
join public.v_recipe_line_costs l on l.menu_item_id = s.menu_item_id
group by s.location_id, s.business_date, l.inventory_item_id, l.ingredient, l.base_uom;

comment on view public.v_pos_ingredient_usage is 'Theoretical ingredient use per day = POS sales x recipes, in kg / L / pcs (base_uom), with its cost. Only products that have a recipe count.';

create or replace view public.v_pos_daily
with (security_invoker = true) as
select
  r.location_id,
  r.business_date,
  r.generated_at,
  r.orders_paid,
  r.total_paid,
  r.net_sales,
  r.discount_total,
  r.total_refund,
  round(r.total_paid / nullif(r.orders_paid, 0), 2)                          as avg_order,
  r.cash_total,
  r.card_total,
  r.talabat_total,
  r.keeta_total,
  r.beanz_total,
  r.other_total,
  r.orders_by_method,
  p.items_sold,
  p.items_with_recipe,
  p.net_with_recipe,
  p.recipe_cost,
  round(100 * p.net_with_recipe / nullif(r.net_sales, 0), 1)                 as recipe_coverage_pct,
  round(100 * p.recipe_cost / nullif(p.net_with_recipe / (1 + loc.vat_rate), 0), 1) as food_cost_pct,
  r.closing_check ->> 'state'                                                as closing_state,
  (r.closing_check ->> 'closing_total')::numeric                             as closing_total,
  (r.closing_check ->> 'diff')::numeric                                      as diff_vs_closing
from public.pos_daily_reports r
join public.locations loc on loc.id = r.location_id
left join lateral (
  select sum(s.qty)                                            as items_sold,
         sum(s.qty) filter (where s.menu_item_id is not null)  as items_with_recipe,
         sum(s.net) filter (where s.menu_item_id is not null)  as net_with_recipe,
         sum(s.recipe_cost)                                    as recipe_cost
    from public.v_pos_product_sales s
   where s.report_id = r.id
) p on true;

comment on view public.v_pos_daily is 'Daily POS totals: orders, average order, payment split, discounts, recipe coverage (share of sales with a recipe), food_cost_pct (recipe cost / covered sales before VAT), and the POS vs closing check.';
