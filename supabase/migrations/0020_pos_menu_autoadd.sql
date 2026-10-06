-- 0020_pos_menu_autoadd.sql
-- POS reports keep the menu complete and sorted:
--   * a product (or variant) sold in a POS report that matches no menu item is added to Recipes
--     automatically (source 'pos', no recipe yet), in a section guessed from its name;
--   * menu items without a typed-in price get the POS selling price (gross / qty); newer reports
--     keep POS prices current, older uploads never overwrite them, a price typed by hand is never touched;
--   * old reports can be uploaded in bulk from /owner/pos-reports: the payload flag "quiet" stores the
--     POS-vs-closing check but does not add "Needs you" items for those old days.
-- Also: a menu item that has no recipe lines no longer counts as "costed" in the POS views, and the POS vs
-- closing check also runs when the barista's closing comes in after the report (or is edited), so the
-- report that arrives at 00:01 is checked even when the closing is submitted a few minutes later.
-- Additive: one new column (menu_items.price_pos_date), 'pos' added to the menu_items.source check.

-- ---------------------------------------------------------------- menu items
alter table public.menu_items drop constraint if exists menu_items_source_check;
alter table public.menu_items add constraint menu_items_source_check
  check (source in ('manual', 'photo', 'text', 'ai', 'pos'));

alter table public.menu_items add column if not exists price_pos_date date;
comment on column public.menu_items.price_pos_date is 'Business date of the POS report the price was read from (gross / qty, with VAT). NULL = price typed in by hand, which the POS never overwrites.';

-- A price changed by hand (anything that updates price without setting price_pos_date) becomes a typed price.
create or replace function public.menu_items_price_typed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is distinct from old.price and new.price_pos_date is not distinct from old.price_pos_date then
    new.price_pos_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_menu_items_price_typed on public.menu_items;
create trigger trg_menu_items_price_typed before update of price on public.menu_items
  for each row execute function public.menu_items_price_typed();

-- ---------------------------------------------------------------- helpers
create or replace function public.pos_clean_name(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(coalesce(t, ''), '[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF\U0000FE0F\U0000200D\U000020E3]', '', 'g'),
           '\s+', ' ', 'g')), '')
$$;
comment on function public.pos_clean_name(text) is 'POS product text without emoji and extra spaces, for menu item names.';

create or replace function public.pos_guess_section(t text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when n ~ '\m(v60|pour ?over|drip|chemex)\M' then 'V60'
    when n ~ '\m(smoothies?|acai|açaí|protein|shakes?|bowls?)\M' then 'Smoothies'
    when n ~ '\m(croissants?|sandwich(es)?|toasts?|eggs?|breakfast|bagels?|panini|wraps?|salads?|omelet(te)?s?|shakshuka|manakish|zaatar|halloumi)\M' then 'Bakery & breakfast'
    when n ~ '\mhot chocolate\M' then 'Hot drinks'
    when n ~ '\m(iced|cold) chocolate\M' then 'Cold drinks'
    when n ~ '\m(babka|cookies?|cakes?|brownies?|chocolates?|desserts?|affogato|muffins?|cheesecakes?|donuts?|doughnuts?|tiramisu|pastry|pastries|madeleines?|cupcakes?|tarts?|puddings?|kunafa|basbousa|ice cream|gelato)\M' then 'Desserts'
    when n ~ '\m(water|evian|soda|cola|pepsi|sparkling|red ?bull|7up|sprite|fanta|perrier|pellegrino)\M' then 'Water & soft drinks'
    when n ~ '\m(matcha|teas?|karak|chai|hibiscus|chamomile)\M' then
      case when n ~ '\m(iced?|cold)\M' then 'Cold drinks' else 'Hot drinks' end
    when n ~ '\m(mojitos?|lemonade|juices?|refreshers?|spritz|mocktails?|lemon mint)\M' then 'Cold drinks'
    when n ~ '\m(iced?|cold|frappe|frappuccino|dirty)\M' then 'Iced coffee'
    when n ~ '\m(espresso|americano|latte|cappuccino|cortado|piccolo|macchiato|flat white|mocha|coffee|spanish|turkish|ristretto|lungo|doppio)\M' then 'Hot coffee'
    when n ~ '(قهوة|اسبريسو|لاتيه|كابتشينو)' then 'Hot coffee'
    when n ~ '(شاي|كرك|زهورات)' then 'Hot drinks'
    when n ~ '(عصير|موهيتو|ليمون)' then 'Cold drinks'
    when n ~ '(مياه|ماء)' then 'Water & soft drinks'
    when n ~ '(كيك|كعك|حلى|حلويات|كوكيز|بسبوسة|كنافة)' then 'Desserts'
    when n ~ '(كرواسون|ساندويتش|بيض|فطور|توست)' then 'Bakery & breakfast'
    else 'Other'
  end
  from (select lower(coalesce(t, '')) as n) x
$$;
comment on function public.pos_guess_section(text) is 'Menu section guessed from a product name (Hot coffee, Iced coffee, V60, Smoothies, Hot drinks, Cold drinks, Desserts, Bakery & breakfast, Water & soft drinks, Other).';

-- ---------------------------------------------------------------- views
-- A menu item without recipe lines is matched (menu_item_id) but has no recipe: cost_status 'no_recipe',
-- unit_cost / recipe_cost NULL. New columns at the end: has_recipe, section.
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
  case when c.ingredient_count > 0 then c.cost end                       as unit_cost,
  case when c.ingredient_count > 0 then round(s.qty * c.cost, 2) end     as recipe_cost,
  case
    when m.id is null or coalesce(c.ingredient_count, 0) = 0 then 'no_recipe'
    when c.costed_count < c.ingredient_count then 'partly_costed'
    else 'costed'
  end                        as cost_status,
  coalesce(c.ingredient_count, 0) > 0 as has_recipe,
  m.section                  as section
from public.pos_product_sales s
left join lateral (
  select mi.id, mi.name, mi.section
    from public.menu_items mi
   where mi.location_id = s.location_id
     and public.pos_norm(coalesce(mi.pos_name, mi.name)) in (public.pos_norm(s.product || ' ' || coalesce(s.variant, '')), public.pos_norm(s.product))
   order by (public.pos_norm(coalesce(mi.pos_name, mi.name)) = public.pos_norm(s.product || ' ' || coalesce(s.variant, ''))) desc,
            mi.is_active desc
   limit 1
) m on true
left join public.v_menu_item_costs c on c.menu_item_id = m.id
where not s.is_total;

comment on view public.v_pos_product_sales is 'POS sales per product per day, matched to the menu item by name (pos_name first). recipe_cost = qty x current recipe cost, NULL when the item has no recipe yet. cost_status: costed | partly_costed | no_recipe. section = the menu item''s section.';

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
  select sum(s.qty)                                   as items_sold,
         sum(s.qty) filter (where s.has_recipe)       as items_with_recipe,
         sum(s.net) filter (where s.has_recipe)       as net_with_recipe,
         sum(s.recipe_cost)                           as recipe_cost
    from public.v_pos_product_sales s
   where s.report_id = r.id
) p on true;

comment on view public.v_pos_daily is 'Daily POS totals: orders, average order, payment split, discounts, recipe coverage (share of sales with a recipe), food_cost_pct (recipe cost / covered sales before VAT), and the POS vs closing check.';

-- ---------------------------------------------------------------- menu sync
create or replace function public.pos_sync_menu(p_report_id uuid)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_loc    uuid;
  v_date   date;
  v_new    jsonb := '[]'::jsonb;
  v_prices jsonb := '[]'::jsonb;
  v_sorted integer := 0;
begin
  select location_id, business_date into v_loc, v_date from pos_daily_reports where id = p_report_id;
  if not found then
    raise exception 'pos_sync_menu: report % not found', p_report_id;
  end if;

  -- 1. Products sold that match no menu item become menu items (no recipe yet), sorted into a section.
  with lines as (
    select public.pos_clean_name(v.product) as base,
           public.pos_clean_name(v.variant) as var,
           btrim(v.product || coalesce(' ' || nullif(btrim(v.variant), ''), '')) as pos_text,
           v.qty,
           v.gross
      from v_pos_product_sales v
     where v.report_id = p_report_id
       and v.menu_item_id is null
  ), grouped as (
    select public.pos_norm(base || coalesce(' ' || var, '')) as key,
           min(base || coalesce(' (' || var || ')', ''))    as name,
           min(pos_text)                                   as pos_name,
           sum(qty)                                        as qty,
           sum(gross)                                      as gross
      from lines
     where base is not null
     group by 1
  ), ins as (
    insert into menu_items (location_id, name, section, price, price_pos_date, source, pos_name, notes)
    select v_loc, g.name, public.pos_guess_section(g.name),
           case when g.qty > 0 and g.gross > 0 then round(g.gross / g.qty, 2) end,
           case when g.qty > 0 and g.gross > 0 then v_date end,
           'pos', g.pos_name,
           'Added automatically from the POS report of ' || to_char(v_date, 'FMDD Mon YYYY') || '. Add its recipe to see the cost and margin.'
      from grouped g
     where g.key is not null
    on conflict do nothing
    returning id, name, section, price
  ), aud as (
    insert into audit_log (actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
    select null, 'system', 'created_from_pos_report', 'menu_item', i.id, null,
           jsonb_build_object('name', i.name, 'section', i.section, 'price', i.price,
                              'pos_report_id', p_report_id, 'business_date', v_date)
      from ins i
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'section', i.section, 'price', i.price)
                            order by i.section, i.name), '[]'::jsonb)
    into v_new
    from ins i;

  -- 2. Selling prices: fill items without a price; keep POS-read prices current (a newer report wins).
  with pos_price as (
    select v.menu_item_id, round(sum(v.gross) / sum(v.qty), 2) as unit
      from v_pos_product_sales v
     where v.report_id = p_report_id
       and v.menu_item_id is not null
     group by v.menu_item_id
    having sum(v.qty) > 0 and sum(v.gross) > 0
  ), upd as (
    update menu_items m
       set price = pp.unit, price_pos_date = v_date
      from pos_price pp
      join menu_items o on o.id = pp.menu_item_id
     where m.id = pp.menu_item_id
       and (m.price is null or (m.price_pos_date is not null and m.price_pos_date < v_date))
    returning m.id, m.name, o.price as old_price, m.price as new_price
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'old', old_price, 'new', new_price) order by name)
                    filter (where old_price is distinct from new_price), '[]'::jsonb)
    into v_prices
    from upd;

  -- A price that already equals the POS price (e.g. filled with "Use the POS price") follows the POS from now on.
  update menu_items m
     set price_pos_date = v_date
    from (select v.menu_item_id, round(sum(v.gross) / sum(v.qty), 2) as unit
            from v_pos_product_sales v
           where v.report_id = p_report_id
             and v.menu_item_id is not null
           group by v.menu_item_id
          having sum(v.qty) > 0 and sum(v.gross) > 0) pp
   where m.id = pp.menu_item_id
     and m.price_pos_date is null
     and m.price = pp.unit;

  if jsonb_array_length(v_prices) > 0 then
    insert into audit_log (actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
    values (null, 'system', 'menu_prices_from_pos_report', 'pos_daily_report', p_report_id, null,
            jsonb_build_object('business_date', v_date, 'prices', v_prices));
  end if;

  -- 3. Sold items that still have no section get one.
  update menu_items m set section = public.pos_guess_section(m.name)
   where m.section is null
     and m.id in (select v.menu_item_id from v_pos_product_sales v where v.report_id = p_report_id and v.menu_item_id is not null);
  get diagnostics v_sorted = row_count;

  return jsonb_build_object('new_menu_items', v_new, 'prices_filled', jsonb_array_length(v_prices),
                            'prices', v_prices, 'sections_filled', v_sorted);
end;
$$;

comment on function public.pos_sync_menu(uuid) is 'After a POS report is stored: adds products that match no menu item to the menu (source pos, section guessed, POS price), fills or refreshes POS prices of items without a typed price, gives sold items without a section one.';
revoke all on function public.pos_sync_menu(uuid) from public;
revoke all on function public.pos_sync_menu(uuid) from anon, authenticated;

-- ---------------------------------------------------------------- POS vs closing check
-- One place for the check, used by the import and again whenever the day's closing is added or changed.
create or replace function public.pos_check_closing(p_report_id uuid, p_quiet boolean default false)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_cl     record;
  v_has    boolean;
  v_apps   numeric;
  v_diff   numeric;
  v_check  jsonb;
  v_fill   jsonb := '{}'::jsonb;
  v_title  text;
  v_detail text;
begin
  select id, location_id, business_date, generated_at, total_paid, orders_paid, orders_by_method,
         cash_total, card_total, talabat_total, keeta_total, beanz_total, other_total
    into r
    from pos_daily_reports
   where id = p_report_id;
  if not found then
    return null;
  end if;

  select id, grand_total, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total,
         transactions, transactions_by_method, created_at
    into v_cl
    from closings
   where location_id = r.location_id and closing_date = r.business_date and status <> 'rejected'
   order by created_at desc
   limit 1;
  v_has := found;
  v_apps := r.talabat_total + r.keeta_total + r.beanz_total + r.other_total;

  if not v_has then
    v_check := jsonb_build_object('state', 'no_closing');
  elsif r.generated_at < v_cl.created_at and r.generated_at < (r.business_date + 1)::timestamp at time zone 'Asia/Dubai'
        and r.total_paid - v_cl.grand_total <= 1 then
    -- Made before the closing: later orders may be missing from the POS report, so a lower POS total is expected.
    -- (If the POS already shows MORE than the closing, it is a real shortfall and falls through to the check below.)
    v_check := jsonb_build_object('state', 'report_before_closing', 'closing_id', v_cl.id,
      'pos_total', r.total_paid, 'closing_total', v_cl.grand_total,
      'note', 'The POS report was made before the closing was submitted, so it may not cover the whole day.');
  else
    v_diff := r.total_paid - v_cl.grand_total;
    v_check := jsonb_build_object(
      'state', case when abs(v_diff) <= 1 then 'match' else 'mismatch' end,
      'complete', r.generated_at >= v_cl.created_at or r.generated_at >= (r.business_date + 1)::timestamp at time zone 'Asia/Dubai',
      'closing_id', v_cl.id, 'pos_total', r.total_paid, 'closing_total', v_cl.grand_total, 'diff', v_diff,
      'cash', jsonb_build_object('pos', r.cash_total, 'closing', v_cl.cash_total),
      'card', jsonb_build_object('pos', r.card_total, 'closing', v_cl.card_total),
      'apps', jsonb_build_object('pos', v_apps, 'closing', v_cl.online_total),
      'orders', jsonb_build_object('pos', r.orders_paid, 'closing', v_cl.transactions));
    if abs(v_diff) <= 1 and (v_check ->> 'complete')::boolean then
      -- Same rule as the photo backfill: only fill what is blank, never overwrite.
      if v_cl.transactions is null then
        v_fill := v_fill || jsonb_build_object('transactions', r.orders_paid);
      end if;
      if v_cl.transactions_by_method is null then
        v_fill := v_fill || jsonb_build_object('transactions_by_method', r.orders_by_method);
      end if;
      if v_cl.talabat_total is null and v_cl.keeta_total is null and v_cl.beanz_total is null
         and r.other_total = 0 and abs(coalesce(v_cl.online_total, 0) - v_apps) <= 1 then
        v_fill := v_fill || jsonb_build_object('talabat_total', r.talabat_total, 'keeta_total', r.keeta_total, 'beanz_total', r.beanz_total);
      end if;
      if v_fill <> '{}'::jsonb then
        perform set_config('strow.pos_check', 'on', true);  -- tells trg_closings_pos_recheck not to re-run for this fill
        update closings set
          transactions = coalesce(transactions, (v_fill ->> 'transactions')::int),
          transactions_by_method = coalesce(transactions_by_method, v_fill -> 'transactions_by_method'),
          talabat_total = case when v_fill ? 'talabat_total' then (v_fill ->> 'talabat_total')::numeric else talabat_total end,
          keeta_total = case when v_fill ? 'keeta_total' then (v_fill ->> 'keeta_total')::numeric else keeta_total end,
          beanz_total = case when v_fill ? 'beanz_total' then (v_fill ->> 'beanz_total')::numeric else beanz_total end
        where id = v_cl.id;
        perform set_config('strow.pos_check', '', true);
        insert into audit_log (actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
        values (null, 'system', 'filled_from_pos_report', 'closing', v_cl.id,
                jsonb_build_object('transactions', v_cl.transactions, 'transactions_by_method', v_cl.transactions_by_method,
                                   'talabat_total', v_cl.talabat_total, 'keeta_total', v_cl.keeta_total, 'beanz_total', v_cl.beanz_total),
                v_fill || jsonb_build_object('pos_report_id', r.id));
        v_check := v_check || jsonb_build_object('filled', v_fill);
      end if;
    end if;
  end if;

  -- Needs you: one item per gap over AED 1 (kept up to date); no gap any more closes it.
  if v_check ->> 'state' = 'mismatch' then
    if not p_quiet then
      v_title := format('POS report vs closing %s: POS AED %s, closing AED %s (%s)',
        to_char(r.business_date, 'DD Mon'), to_char(r.total_paid, 'FM999990.00'), to_char(v_cl.grand_total, 'FM999990.00'),
        case when v_diff > 0 then 'AED ' || to_char(v_diff, 'FM999990.00') || ' missing from the closing'
             else 'closing AED ' || to_char(-v_diff, 'FM999990.00') || ' higher than the POS' end);
      v_detail := format('Cash: POS %s vs closing %s. Card: POS %s vs closing %s. Apps (Talabat/Keeta/Beanz): POS %s vs closing %s. Orders: POS %s vs closing %s.',
        r.cash_total, coalesce(v_cl.cash_total::text, '-'), r.card_total, coalesce(v_cl.card_total::text, '-'),
        v_apps, coalesce(v_cl.online_total::text, '-'), r.orders_paid, coalesce(v_cl.transactions::text, '-'));
      update ai_actions set title = v_title, detail = v_detail, created_at = now()
       where entity_table = 'closings' and entity_id = v_cl.id and status = 'info' and title like 'POS report vs closing%';
      if not found then
        insert into ai_actions (source, status, severity, title, detail, confidence, entity_table, entity_id)
        values ('autopilot', 'info', case when abs(v_diff) >= 50 then 'critical' else 'warn' end, v_title, v_detail, 1, 'closings', v_cl.id);
      end if;
    end if;
  else
    update ai_actions set status = 'resolved', decided_at = now()
     where entity_table = 'closings' and status = 'info' and title like 'POS report vs closing%'
       and entity_id in (select c.id from closings c where c.location_id = r.location_id and c.closing_date = r.business_date);
  end if;

  update pos_daily_reports set closing_check = v_check where id = r.id;
  return v_check;
end;
$$;

comment on function public.pos_check_closing(uuid, boolean) is 'POS report vs the barista closing of the same day: stores closing_check (match / mismatch / no_closing / report_before_closing), fills blank closing fields when the totals match, keeps one Needs-you item per gap over AED 1 (none when p_quiet) and closes it once the gap is gone.';
revoke all on function public.pos_check_closing(uuid, boolean) from public;
revoke all on function public.pos_check_closing(uuid, boolean) from anon, authenticated;

-- The closing usually arrives around midnight, sometimes minutes after the POS report: check again
-- whenever a closing is added or its totals, date or status change. Never blocks saving the closing.
create or replace function public.closings_pos_recheck()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rep      record;
  v_old    date;
  v_today  date := (now() at time zone 'Asia/Dubai')::date;
begin
  if coalesce(current_setting('strow.pos_check', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    v_old := old.closing_date;
  end if;
  begin
    for rep in
      select id, business_date
        from pos_daily_reports
       where location_id = new.location_id
         and business_date in (new.closing_date, v_old)
    loop
      -- Old days (more than 2 days back) are re-checked quietly, like old uploads.
      perform public.pos_check_closing(rep.id, rep.business_date < v_today - 2);
    end loop;
  exception when others then
    raise warning 'closings_pos_recheck: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_closings_pos_recheck on public.closings;
create trigger trg_closings_pos_recheck
  after insert or update of closing_date, status, cash_total, card_total, online_total, talabat_total, keeta_total, beanz_total
  on public.closings
  for each row execute function public.closings_pos_recheck();

-- ---------------------------------------------------------------- import (adds: menu sync, quiet flag, shared closing check)
create or replace function public.pos_import_report(p jsonb)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sum      jsonb := p -> 'sum';
  v_quiet    boolean := coalesce(p -> 'quiet' = 'true'::jsonb, false);
  v_loc      uuid;
  v_date     date;
  v_gen      timestamptz;
  v_n        bigint;
  v_s        numeric;
  v_c        bigint;
  v_k        numeric;
  v_old      record;
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
  v_check    jsonb;
  v_matched  integer;
  v_lines    integer;
  v_menu     jsonb;
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

  -- New products go to the menu, prices are filled (pos_sync_menu).
  v_menu := public.pos_sync_menu(v_id);

  -- 4. POS vs the barista closing of the same day (pos_check_closing stores closing_check).
  v_check := public.pos_check_closing(v_id, v_quiet);

  insert into audit_log (actor_id, actor_type, action, entity_type, entity_id, before_state, after_state)
  values (null, 'system', 'pos_report_' || v_status, 'pos_daily_report', v_id,
          case when v_status = 'replaced' then jsonb_build_object('generated_at', v_old.generated_at) end,
          jsonb_build_object('business_date', v_date, 'generated_at', v_gen, 'orders', (v_sum ->> 'orders')::int,
                             'total_paid', v_paid, 'source_message_id', p ->> 'msg', 'file_sha256', p ->> 'sha',
                             'closing', v_check ->> 'state', 'quiet', v_quiet,
                             'new_menu_items', jsonb_array_length(v_menu -> 'new_menu_items'),
                             'prices_filled', (v_menu ->> 'prices_filled')::int));

  select count(*), count(*) filter (where has_recipe) into v_lines, v_matched
    from v_pos_product_sales where report_id = v_id;

  return jsonb_build_object(
    'status', v_status, 'report_id', v_id, 'date', v_date, 'generated_at', v_gen,
    'orders', (v_sum ->> 'orders')::int, 'total_paid', v_paid,
    'products', v_lines, 'products_with_recipe', v_matched,
    'new_menu_items', v_menu -> 'new_menu_items', 'prices_filled', (v_menu ->> 'prices_filled')::int,
    'closing', v_check, 'quiet', v_quiet, 'warnings', coalesce(p -> 'warn', '[]'::jsonb));
end;
$$;

comment on function public.pos_import_report(jsonb) is 'Imports one parsed POS daily report (payload from pos_report.py or the upload page). Verifies a checksum and the totals, keeps one report per business date (newer wins), adds new products to the menu, checks it against the closing. Payload flag quiet = true (old days uploaded in bulk): no Needs you items.';
revoke all on function public.pos_import_report(jsonb) from public;
revoke all on function public.pos_import_report(jsonb) from anon, authenticated;

-- ---------------------------------------------------------------- backfill
-- Reports already imported: add their new products and prices (oldest first so the newest price wins),
-- and check each one against its closing again.
do $$
declare
  r record;
begin
  for r in select id, business_date from public.pos_daily_reports order by business_date, generated_at loop
    perform public.pos_sync_menu(r.id);
    perform public.pos_check_closing(r.id, r.business_date < (now() at time zone 'Asia/Dubai')::date - 2);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- Strow AI note
update public.ai_memory
   set note = 'The EZI POS emails each day''s full report just after midnight and it is imported automatically at 00:05 Dubai; the owner can also upload old days'' reports on the POS reports page (pos_daily_reports.source = upload; old days import quietly, without Needs-you items). Use it for sales questions instead of estimating: pos_daily_reports = one row per business_date (orders_paid, total_paid = what the POS took in, net_sales, discount_total = comps/discounts given, cash/card/talabat/keeta/beanz/other totals, orders_by_method, closing_check). v_pos_daily = daily summary (avg_order, recipe_coverage_pct, food_cost_pct before VAT, closing_state match/mismatch/no_closing/report_before_closing, diff_vs_closing). v_pos_product_sales = units and net sales per product matched to menu items (recipe_cost, cost_status costed/partly_costed/no_recipe, has_recipe, section); in raw pos_product_sales skip is_total rows (variant totals). Products sold that are not on the menu are added to menu_items automatically (source = pos, no recipe lines yet, section guessed from the name, price = POS gross / qty with price_pos_date set; a price typed by hand is never overwritten). v_pos_ingredient_usage = theoretical ingredient use per day from sales x recipes. pos_orders = every paid order (paid_at, payment_method, items, staff). A report generated before the closing can be partial (closing_state report_before_closing); a newer report for the same day replaces it. Barista closings stay the cash count of record; the POS vs closing check also runs when the closing comes in later, and a gap over AED 1 creates a Needs-you item.',
       updated_at = now()
 where scope = 'general' and subject = 'POS daily reports';
