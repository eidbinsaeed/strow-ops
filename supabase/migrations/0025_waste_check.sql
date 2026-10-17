-- 0025_waste_check.sql — waste check: what was used vs what the POS says should have been used (2026-10-17)
--
-- Between two full counts (shop and store room counted on the same day = a "stock take"):
--   used        = stock at the first take + bought (bills) − stock at the second take
--   should use  = POS items sold × recipes (v_pos_ingredient_usage), cut at the exact count times
--   unexplained = used − should use − what staff logged as thrown away
-- all in recipe base units (kg / L / pcs), priced at what was paid for it in the period.
--
-- Additive only (new column, new views, new functions; v_item_unit_cost is re-created with the
-- same columns and the same results, now reading its bill lines from v_purchase_lines).

-- 1. Same thing, another brand or pack (Al Rawabi 2 L, Al Ain UHT and Lacnor are all full-cream milk).
alter table public.inventory_items add column if not exists same_as uuid references public.inventory_items(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_items_same_as_not_self') then
    alter table public.inventory_items add constraint inventory_items_same_as_not_self check (same_as is null or same_as <> id);
  end if;
end $$;
comment on column public.inventory_items.same_as is
  'For stock and waste: this item is the same thing as that one (another brand or pack size). The waste check adds them up under that item. Recipes and prices are not changed.';

-- Every item and the item its group is named after (follows same_as up to 5 steps).
create or replace view public.v_inventory_groups with (security_invoker = true) as
with recursive up as (
  select i.id as item_id, i.id as group_id, i.same_as, 0 as depth from public.inventory_items i
  union all
  select up.item_id, p.id, p.same_as, up.depth + 1
  from up join public.inventory_items p on p.id = up.same_as
  where up.depth < 5
)
select distinct on (up.item_id) up.item_id, up.group_id
from up
order by up.item_id, (up.same_as is null) desc, up.depth desc;

comment on view public.v_inventory_groups is 'Each inventory item with the item it counts as for stock and waste (itself unless same_as is set).';

-- 2. Every received bill line in recipe base units (kg / L / pcs). One place for the conversion,
--    used by v_item_unit_cost (prices) and stock_waste (what was bought).
create or replace view public.v_purchase_lines with (security_invoker = true) as
select
  li.id                                               as line_id,
  li.expense_id,
  li.inventory_item_id,
  e.location_id,
  e.expense_date,
  li.created_at,
  e.supplier_id,
  s.name                                              as supplier_name,
  li.description,
  li.line_total::numeric                              as net_total,
  (li.line_total + coalesce(li.vat_amount, 0))::numeric as paid_total,
  case
    -- sold as sets (cup + lid): price per set, so 1 pcs in a recipe = one cup with its lid
    when cardinality(li.set_parts) > 1 and li.count_qty > 0 then li.count_qty
    -- measured on the bill in kg / L
    when li.base_qty > 0 and li.base_uom in ('kg', 'L') then li.base_qty
    -- counted in pieces, and the item has a pack size (1 punnet = 250 g)
    when li.base_qty > 0 and i.default_unit_size > 0 and public.uom_base(i.default_size_uom) in ('kg', 'L')
      then li.base_qty * i.default_unit_size * public.uom_factor(i.default_size_uom)
    when li.base_qty > 0 then li.base_qty
    -- older lines with no measured quantity: billed quantity x pack size
    when li.quantity > 0 and i.default_unit_size > 0 and public.uom_base(i.default_size_uom) is not null
      then li.quantity * i.default_unit_size * public.uom_factor(i.default_size_uom)
    when li.quantity > 0 then li.quantity
  end as base_qty,
  case
    when cardinality(li.set_parts) > 1 and li.count_qty > 0 then 'pcs'
    when li.base_qty > 0 and li.base_uom in ('kg', 'L') then li.base_uom
    when li.base_qty > 0 and i.default_unit_size > 0 and public.uom_base(i.default_size_uom) in ('kg', 'L')
      then public.uom_base(i.default_size_uom)
    when li.base_qty > 0 then 'pcs'
    when li.quantity > 0 and i.default_unit_size > 0 and public.uom_base(i.default_size_uom) is not null
      then public.uom_base(i.default_size_uom)
    when li.quantity > 0 then 'pcs'
  end as base_uom
from public.expense_line_items li
join public.expenses e         on e.id = li.expense_id
join public.inventory_items i  on i.id = li.inventory_item_id
left join public.suppliers s   on s.id = e.supplier_id
where coalesce(li.line_kind, 'goods') = 'goods'
  and e.goods_received is not false
  and e.status <> 'rejected';

comment on view public.v_purchase_lines is 'Received goods lines of bills that are not rejected, with the quantity in recipe base units (base_qty in kg / L / pcs).';

-- Same columns and results as 0018, now reading from v_purchase_lines.
create or replace view public.v_item_unit_cost
with (security_invoker = true) as
with lines as (
  select inventory_item_id, line_id, expense_date, created_at, supplier_name, description, net_total, paid_total, base_qty, base_uom
  from public.v_purchase_lines
  where net_total > 0
),
ranked as (
  select
    l.*,
    l.net_total / l.base_qty  as unit_cost,
    l.paid_total / l.base_qty as unit_cost_paid,
    row_number() over (partition by l.inventory_item_id order by l.expense_date desc, l.created_at desc)             as rn,
    row_number() over (partition by l.inventory_item_id, l.base_uom order by l.expense_date desc, l.created_at desc) as rn_uom,
    count(*) over (partition by l.inventory_item_id)                                                               as buys
  from lines l
  where l.base_qty > 0
)
select
  r.inventory_item_id,
  r.base_uom,
  round(r.unit_cost, 4)      as unit_cost,
  round(r.unit_cost_paid, 4) as unit_cost_paid,
  round(p.unit_cost, 4)      as prev_unit_cost,
  r.expense_date             as last_bought,
  r.supplier_name,
  r.description              as last_description,
  r.line_id                  as last_line_id,
  r.buys
from ranked r
left join ranked p
  on p.inventory_item_id = r.inventory_item_id and p.base_uom = r.base_uom and p.rn_uom = 2
where r.rn = 1;

-- 3. Stock takes: a day when both the shop and the store room were counted. The take time is the
--    shop count (that is where stock is used).
create or replace view public.v_stock_takes with (security_invoker = true) as
select
  sh.location_id,
  sh.counted_on   as take_date,
  sh.counted_at   as take_at,
  sh.id           as shop_count_id,
  sh.barista_id   as shop_barista_id,
  st.id           as store_count_id,
  st.counted_at   as store_at,
  st.barista_id   as store_barista_id,
  (select count(*) from public.stock_count_lines l where l.count_id = sh.id) as shop_lines,
  (select count(*) from public.stock_count_lines l where l.count_id = st.id) as store_lines
from (
  select distinct on (location_id, counted_on) * from public.stock_counts where place = 'shop'
  order by location_id, counted_on, counted_at desc
) sh
join (
  select distinct on (location_id, counted_on) * from public.stock_counts where place = 'store'
  order by location_id, counted_on, counted_at desc
) st on st.location_id = sh.location_id and st.counted_on = sh.counted_on;

comment on view public.v_stock_takes is 'Days when the shop and the store room were both counted (a full count). take_at = the shop count time.';

-- 4. Share of a POS day's items sold at or before a moment (0..1), from the order times.
--    Days without order times: 07:00–24:00 Dubai, evenly.
create or replace function public.pos_day_share(p_location uuid, p_day date, p_at timestamptz)
returns numeric
language sql stable security invoker set search_path = ''
as $$
  select case
    when p_at >= ((p_day + 1)::timestamp + interval '4 hours') at time zone 'Asia/Dubai' then 1::numeric
    when p_at <= (p_day::timestamp + interval '5 hours') at time zone 'Asia/Dubai' then 0::numeric
    else coalesce(
      (select (sum(o.product_qty) filter (where o.paid_at <= p_at))::numeric / nullif(sum(o.product_qty), 0)
         from public.pos_orders o
        where o.location_id = p_location and o.business_date = p_day),
      least(1::numeric, greatest(0::numeric,
        (extract(epoch from (p_at - ((p_day::timestamp + interval '7 hours') at time zone 'Asia/Dubai'))) / (17 * 3600))::numeric))
    )
  end
$$;

-- 5. The waste check per item group between two stock takes (dates from v_stock_takes).
--    status: ok | not_counted | no_size | unit_mismatch | missing_bills | no_recipe | not_on_list
create or replace function public.stock_waste(p_from date, p_to date, p_location uuid default null)
returns table (
  group_id uuid,
  name text,
  members jsonb,
  base_uom text,
  opening numeric,
  bought numeric,
  closing numeric,
  used numeric,
  should_use numeric,
  logged_waste numeric,
  unexplained numeric,
  unit_cost numeric,
  used_cost numeric,
  should_cost numeric,
  waste_cost numeric,
  unexplained_cost numeric,
  status text,
  detail jsonb
)
language sql stable security invoker set search_path = ''
as $$
with
loc as (
  select coalesce(p_location, (select l.id from public.locations l where l.is_active order by l.created_at limit 1)) as id
),
tk as (
  select 0 as w, t.* from public.v_stock_takes t, loc where t.location_id = loc.id and t.take_date = p_from
  union all
  select 1 as w, t.* from public.v_stock_takes t, loc where t.location_id = loc.id and t.take_date = p_to
),
win as (
  -- A take before noon is a morning count: that day's deliveries come after it.
  select
    max(take_at) filter (where w = 0) as t0,
    max(take_at) filter (where w = 1) as t1,
    max(case when extract(hour from take_at at time zone 'Asia/Dubai') < 12 then take_date else take_date + 1 end) filter (where w = 0) as cut0,
    max(case when extract(hour from take_at at time zone 'Asia/Dubai') < 12 then take_date else take_date + 1 end) filter (where w = 1) as cut1
  from tk
),
g as (select item_id, group_id from public.v_inventory_groups),
cnt as (
  select tk.w, tk.take_at, si.id as stock_item_id, si.place, si.name, si.unit_label, si.base_per_unit,
         si.is_active, si.created_at, g.group_id, cl.qty
  from tk
  join public.stock_items si on si.location_id = tk.location_id and si.inventory_item_id is not null
  join g on g.item_id = si.inventory_item_id
  left join public.stock_count_lines cl
    on cl.stock_item_id = si.id
   and cl.count_id = case si.place when 'shop' then tk.shop_count_id else tk.store_count_id end
),
cnt_g as (
  select group_id, w,
    coalesce(sum(qty * base_per_unit) filter (where qty is not null and base_per_unit is not null), 0) as qty_base,
    coalesce(bool_or(qty is null and is_active and created_at <= take_at), false) as missing,
    coalesce(bool_or(qty > 0 and base_per_unit is null), false) as no_size,
    jsonb_agg(jsonb_build_object('place', place, 'name', name, 'unit', unit_label, 'qty', qty, 'per', base_per_unit)
              order by place, name)
      filter (where qty is not null or (is_active and created_at <= take_at)) as items
  from cnt
  group by group_id, w
),
buy as (
  select g.group_id, p.base_uom,
    sum(p.base_qty) as qty,
    sum(p.net_total) filter (where p.net_total > 0) as net,
    sum(p.base_qty) filter (where p.net_total > 0) as priced_qty,
    jsonb_agg(jsonb_build_object('date', p.expense_date, 'supplier', p.supplier_name, 'what', p.description,
                                 'qty', round(p.base_qty, 3), 'uom', p.base_uom, 'net', p.net_total, 'expense_id', p.expense_id)
              order by p.expense_date) as lines
  from public.v_purchase_lines p
  join g on g.item_id = p.inventory_item_id
  cross join loc cross join win
  where p.location_id = loc.id and p.expense_date >= win.cut0 and p.expense_date < win.cut1 and p.base_qty > 0
  group by g.group_id, p.base_uom
),
days as (
  select d::date as d,
    public.pos_day_share(loc.id, d::date, win.t1) - public.pos_day_share(loc.id, d::date, win.t0) as share
  from loc cross join win
  cross join generate_series((p_from - 1)::timestamp, p_to::timestamp, interval '1 day') d
),
should as (
  select g.group_id, u.base_uom, sum(u.qty_used * days.share) as qty, sum(coalesce(u.cost, 0) * days.share) as cost
  from public.v_pos_ingredient_usage u
  join days on days.d = u.business_date and days.share > 0
  join g on g.item_id = u.inventory_item_id
  cross join loc
  where u.location_id = loc.id
  group by g.group_id, u.base_uom
),
wasted as (
  select g.group_id,
    coalesce(sum(cl.wasted * si.base_per_unit) filter (where si.base_per_unit is not null), 0) as qty,
    coalesce(bool_or(si.base_per_unit is null), false) as no_size,
    jsonb_agg(jsonb_build_object('on', c.counted_on, 'name', si.name, 'qty', cl.wasted, 'unit', si.unit_label, 'why', cl.waste_reason)
              order by c.counted_on) as lines
  from public.stock_count_lines cl
  join public.stock_counts c on c.id = cl.count_id
  join public.stock_items si on si.id = cl.stock_item_id
  join g on g.item_id = si.inventory_item_id
  cross join loc cross join win
  where c.location_id = loc.id and c.place = 'shop' and cl.wasted > 0
    and c.counted_at > win.t0 and c.counted_at <= win.t1
  group by g.group_id
),
grps as (
  select group_id from cnt_g union select group_id from buy union select group_id from should union select group_id from wasted
),
uom as (
  select x.group_id, coalesce(
    (select s.base_uom from should s where s.group_id = x.group_id order by s.qty desc limit 1),
    (select b.base_uom from buy b where b.group_id = x.group_id order by b.qty desc limit 1),
    (select coalesce(i.base_uom, public.uom_base(i.default_size_uom)) from public.inventory_items i where i.id = x.group_id),
    'pcs') as base_uom
  from grps x
),
price as (
  select u.group_id, coalesce(
    (select b.net / nullif(b.priced_qty, 0) from buy b where b.group_id = u.group_id and b.base_uom = u.base_uom and b.priced_qty > 0),
    (select c.unit_cost from public.v_item_unit_cost c join g on g.item_id = c.inventory_item_id
      where g.group_id = u.group_id and c.base_uom = u.base_uom
      order by (c.inventory_item_id = u.group_id) desc, c.last_bought desc limit 1),
    (select s.cost / nullif(s.qty, 0) from should s where s.group_id = u.group_id and s.base_uom = u.base_uom and s.cost > 0)
  ) as unit_cost
  from uom u
),
res as (
  select
    u.group_id, u.base_uom, pr.unit_cost,
    o.qty_base as opening,
    coalesce(b.qty, 0) as bought,
    c.qty_base as closing,
    coalesce(s.qty, 0) as should_use,
    coalesce(wz.qty, 0) as logged_waste,
    (o.group_id is null and c.group_id is null) as no_list,
    coalesce(o.missing, false) as missing0,
    coalesce(c.missing, false) as missing1,
    coalesce(o.no_size, false) or coalesce(c.no_size, false) or coalesce(wz.no_size, false) as no_size,
    exists (select 1 from buy x where x.group_id = u.group_id and x.base_uom is distinct from u.base_uom and x.qty > 0) as buy_mismatch,
    exists (select 1 from should x where x.group_id = u.group_id and x.base_uom is distinct from u.base_uom and x.qty > 0) as recipe_mismatch,
    o.items as items0, c.items as items1, b.lines as bills, wz.lines as waste_lines
  from uom u
  left join price pr on pr.group_id = u.group_id
  left join cnt_g o on o.group_id = u.group_id and o.w = 0
  left join cnt_g c on c.group_id = u.group_id and c.w = 1
  left join buy b on b.group_id = u.group_id and b.base_uom = u.base_uom
  left join should s on s.group_id = u.group_id and s.base_uom = u.base_uom
  left join wasted wz on wz.group_id = u.group_id
),
calc as (
  select r.*,
    coalesce(r.opening, 0) + r.bought - coalesce(r.closing, 0) as used_qty,
    case
      when r.no_list then 'not_on_list'
      when r.missing0 or r.missing1 then 'not_counted'
      when r.no_size then 'no_size'
      when r.buy_mismatch or r.recipe_mismatch then 'unit_mismatch'
      when coalesce(r.opening, 0) + r.bought - coalesce(r.closing, 0)
           < -greatest(0.02 * (coalesce(r.opening, 0) + r.bought), 0.001) then 'missing_bills'
      when r.should_use = 0 then 'no_recipe'
      else 'ok'
    end as st
  from res r
)
select
  c.group_id,
  i.name,
  coalesce((select jsonb_agg(m.name order by m.name) from public.inventory_items m join g on g.item_id = m.id
             where g.group_id = c.group_id and m.id <> c.group_id), '[]'::jsonb) as members,
  c.base_uom,
  round(c.opening, 3),
  round(c.bought, 3),
  round(c.closing, 3),
  round(c.used_qty, 3),
  round(c.should_use, 3),
  round(c.logged_waste, 3),
  round(c.used_qty - c.should_use - c.logged_waste, 3),
  round(c.unit_cost, 4),
  round(c.used_qty * c.unit_cost, 2),
  round(c.should_use * c.unit_cost, 2),
  round(c.logged_waste * c.unit_cost, 2),
  round((c.used_qty - c.should_use - c.logged_waste) * c.unit_cost, 2),
  c.st,
  jsonb_build_object('start', c.items0, 'end', c.items1, 'bills', c.bills, 'thrown', c.waste_lines,
                     'missing_start', c.missing0, 'missing_end', c.missing1)
from calc c
join public.inventory_items i on i.id = c.group_id
where (select t0 from win) < (select t1 from win)
order by (c.st = 'ok') desc, abs(round((c.used_qty - c.should_use - c.logged_waste) * coalesce(c.unit_cost, 0), 2)) desc, i.name
$$;

comment on function public.stock_waste(date, date, uuid) is
  'Waste check between two stock takes (v_stock_takes dates): used = opening + bought − closing, should_use = POS sales × recipes, unexplained = used − should_use − logged_waste. Base units kg / L / pcs; costs before VAT.';

-- The period itself: take times, bill dates used and POS sales in it.
create or replace function public.stock_waste_period(p_from date, p_to date, p_location uuid default null)
returns table (
  t0 timestamptz, t1 timestamptz, bills_from date, bills_to date,
  sales numeric, sales_ex_vat numeric, items_sold numeric, report_days int, missing_report_days date[]
)
language sql stable security invoker set search_path = ''
as $$
with
loc as (
  select coalesce(p_location, (select l.id from public.locations l where l.is_active order by l.created_at limit 1)) as id
),
tk as (
  select (t.take_date = p_to) as is_end, t.take_date, t.take_at
  from public.v_stock_takes t, loc where t.location_id = loc.id and t.take_date in (p_from, p_to)
),
win as (
  select
    max(take_at) filter (where not is_end) as t0,
    max(take_at) filter (where is_end) as t1,
    max(case when extract(hour from take_at at time zone 'Asia/Dubai') < 12 then take_date else take_date + 1 end) filter (where not is_end) as cut0,
    max(case when extract(hour from take_at at time zone 'Asia/Dubai') < 12 then take_date else take_date + 1 end) filter (where is_end) as cut1
  from tk
),
days as (
  select d::date as d,
    public.pos_day_share(loc.id, d::date, win.t1) - public.pos_day_share(loc.id, d::date, win.t0) as share
  from loc cross join win
  cross join generate_series((p_from - 1)::timestamp, p_to::timestamp, interval '1 day') d
)
select
  win.t0, win.t1, win.cut0, win.cut1 - 1,
  round(coalesce(sum(r.net_sales * days.share), 0), 2),
  round(coalesce(sum(r.net_sales * days.share), 0) / (1 + coalesce((select l.vat_rate from public.locations l where l.id = (select id from loc)), 0.05)), 2),
  round(coalesce(sum(r.items_sold * days.share), 0), 1),
  count(r.business_date) filter (where days.share > 0)::int,
  coalesce(array_agg(days.d order by days.d) filter (where days.share > 0.01 and r.business_date is null), '{}')
from win
cross join days
left join public.v_pos_daily r on r.business_date = days.d and r.location_id = (select id from loc)
where win.t0 < win.t1
group by win.t0, win.t1, win.cut0, win.cut1
$$;

revoke execute on function public.pos_day_share(uuid, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.stock_waste(date, date, uuid) from public, anon, authenticated;
revoke execute on function public.stock_waste_period(date, date, uuid) from public, anon, authenticated;
grant execute on function public.pos_day_share(uuid, date, timestamptz) to service_role;
grant execute on function public.stock_waste(date, date, uuid) to service_role;
grant execute on function public.stock_waste_period(date, date, uuid) to service_role;
