-- 0029 · App prices: what Talabat, Keeta and Beanz customers pay (1 Nov 2026)
--
-- The delivery apps sell at higher prices than the shop (Latte 20 in the shop, 25 on the apps),
-- but staff usually ring app orders into the POS at shop prices: in October the app orders that
-- can be checked were rung at 17,916 while the customers paid 21,687 on the apps. So the POS,
-- the closings and the app-fee estimate all undercounted app sales.
--
-- This adds the app price per menu item and values every app order at app prices. An order staff
-- already rang at the app price (or higher, with extras) keeps what the POS took; a free order
-- stays free; an order with an item Strow can't match keeps the POS amount.
-- Additive only: nothing existing changes.

alter table public.menu_items add column if not exists app_price numeric
  check (app_price is null or app_price >= 0);
alter table public.menu_items add column if not exists app_price_updated_at timestamptz;
comment on column public.menu_items.app_price is
  'Price on the delivery apps (Talabat, Keeta and Beanz are the same), incl. VAT. NULL = not on the apps / same as the shop price.';

-- From the owner's Talabat menu, 1 Nov 2026 ("similar on Beanz and Keeta").
update public.menu_items m
set app_price = v.p, app_price_updated_at = now()
from (values
  ('Vanilla', 16), ('Mango', 16),
  ('Iced Americano', 20), ('Iced Latte', 25), ('Iced Spanish Latte', 28), ('Iced Spanish Cortado', 28),
  ('Cold Brew', 28), ('Affogato', 26), ('Iced Saffron Latte', 25), ('Hibiscus', 28), ('Qave Signature', 38),
  ('Iced Cloudy Mocha', 32), ('Mojito', 25), ('Evian Water', 15), ('Sparkling Water', 17),
  ('V60 (Coconut)', 47), ('V60 (Berries) Ethiopian', 44), ('V60 Pina Colada', 47), ('V60 (Bubble gum)', 47),
  ('V60 (Sweet Melon)', 47), ('V60 (Peach)', 47),
  ('Latte', 25), ('Espresso', 19), ('Americano', 20), ('Cappuccino', 25), ('Flat White', 23), ('Cortado', 23),
  ('Piccolo', 19), ('Spanish Latte', 29), ('Spanish Cortado', 29), ('Macchiato', 19), ('Hot Chocolate', 38),
  ('Spanish Piccolo', 24),
  ('Acai Smoothie', 42), ('Iced Matcha Latte', 42), ('Protein Shake (Green Boost)', 39),
  ('Protein Shake (Blueberry Boost)', 42), ('Protein Blueberry', 42),
  ('Asseda', 39), ('Mini Raspberry CheeseCake', 18), ('San Sebastian Cake', 34), ('Strawberry chocolate', 37),
  ('Cookies', 22), ('Acai Bowl', 42), ('Basbousa cake', 44), ('Nutella Babka', 28)
) as v(name, p)
where lower(m.name) = lower(v.name)
  and m.app_price is distinct from v.p;

-- Every app order, valued at app prices.
create or replace view public.v_pos_app_orders
with (security_invoker = true) as
with lines as (
  select
    o.id, o.location_id, o.business_date, o.order_id, o.paid_at, o.payment_method, o.total_paid,
    coalesce(nullif(it->>'qty', '')::numeric, 1) as qty,
    it->>'name' as item,
    mi.id as menu_item_id, mi.price, mi.app_price
  from public.pos_orders o
  left join lateral jsonb_array_elements(o.items) it on true
  left join lateral (
    select m.id, m.price, m.app_price
    from public.menu_items m
    where m.location_id = o.location_id
      and public.pos_norm(it->>'name') in (public.pos_norm(coalesce(m.pos_name, m.name)), public.pos_norm(m.name))
    order by m.is_active desc, (m.app_price is not null) desc
    limit 1
  ) mi on true
  where o.payment_method in ('talabat', 'keeta', 'beanz')
)
select
  id,
  location_id,
  business_date,
  order_id,
  max(paid_at)                                         as paid_at,
  payment_method                                       as app,
  max(total_paid)                                      as pos_paid,
  round(sum(qty * coalesce(app_price, price)), 2)      as app_value,
  bool_and(menu_item_id is not null)                   as all_matched,
  bool_or(app_price is not null)                       as has_app_price,
  case
    when max(total_paid) <= 0 then max(total_paid)
    when bool_and(menu_item_id is not null) and bool_or(app_price is not null)
      then greatest(max(total_paid), round(sum(qty * coalesce(app_price, price)), 2))
    else max(total_paid)
  end                                                  as app_sales,
  jsonb_agg(jsonb_build_object('item', item, 'qty', qty, 'shop', price, 'app', app_price)) as items
from lines
group by id, location_id, business_date, order_id, payment_method;

comment on view public.v_pos_app_orders is
  'Each Talabat / Keeta / Beanz order from the POS: pos_paid = what the POS took (often shop prices), app_value = items × app price (shop price for items with none), app_sales = what the customer really paid on the app (the larger of the two; free orders stay 0; orders with an unknown item keep the POS amount).';

-- Per day and app: the POS figure, the real app sales, and the difference.
create or replace view public.v_app_sales_daily
with (security_invoker = true) as
select
  location_id,
  business_date,
  app,
  count(*)                                                        as orders,
  sum(pos_paid)                                                   as pos_paid,
  sum(app_sales)                                                  as app_sales,
  sum(app_sales - pos_paid)                                       as extra,
  count(*) filter (where app_sales > pos_paid)                    as orders_at_shop_price,
  count(*) filter (where pos_paid > 0 and not (all_matched and has_app_price)) as orders_unpriced
from public.v_pos_app_orders
group by location_id, business_date, app;

comment on view public.v_app_sales_daily is
  'Per day and app: orders, pos_paid (as rung in the POS), app_sales (at app prices), extra = app_sales − pos_paid (app sales the POS and the closing miss), orders_at_shop_price, orders_unpriced (kept at the POS amount).';

-- Margins on the apps: app price before VAT next to the shop one (fees are taken off in the app, per app).
create or replace view public.v_menu_item_costs
with (security_invoker = true) as
select
  m.id                                   as menu_item_id,
  m.location_id,
  m.name,
  m.section,
  m.price,
  m.is_active,
  count(l.id)                            as ingredient_count,
  count(l.line_cost)                     as costed_count,
  round(coalesce(sum(l.line_cost), 0), 2) as cost,
  round(m.price / (1 + loc.vat_rate), 2)  as price_ex_vat,
  case when m.price > 0 and count(l.line_cost) > 0
    then round(m.price / (1 + loc.vat_rate) - sum(l.line_cost), 2) end as profit,
  case when m.price > 0 and count(l.line_cost) > 0
    then round(100 * (1 - sum(l.line_cost) / (m.price / (1 + loc.vat_rate))), 1) end as margin_pct,
  m.app_price,
  round(m.app_price / (1 + loc.vat_rate), 2) as app_price_ex_vat
from public.menu_items m
join public.locations loc on loc.id = m.location_id
left join public.v_recipe_line_costs l on l.menu_item_id = m.id
group by m.id, loc.vat_rate;

comment on view public.v_menu_item_costs is 'Per menu item: cost of its recipe, price before VAT, profit and margin % (both before VAT); app_price / app_price_ex_vat = the price on the delivery apps (app fees are not taken off here). profit/margin NULL until at least one line is priced; costed_count < ingredient_count means some lines have no price yet.';

-- Items on the Talabat menu that Strow's menu didn't have yet (they sell in the POS).
-- Shop price only where the POS shows it (V60 Grapes 39 on card orders).
insert into public.menu_items (location_id, name, pos_name, section, price, app_price, app_price_updated_at, source)
select l.id, v.name, v.pos_name, v.section, v.price, v.app_price, now(), 'ai'
from public.locations l
cross join (values
  ('V60 (Grapes)', 'V60 (Grapes) 🍇', 'V60', 39::numeric, 44::numeric),
  ('V60 (White Honey) Colombian', 'V60 (White Honey) Colombian 🍯', 'V60', null, 47),
  ('Creamy Matcha Latte', 'Creamy matcha latte', 'Coffee', null, 45),
  ('Peach Ice Tea', 'Peach Ice Tea', 'Drinks', null, 25),
  ('Qavè Signature Parfait', 'Qavè Signature Parfait', 'Food', null, 42)
) as v(name, pos_name, section, price, app_price)
where l.slug = 'qave_main'
  and not exists (select 1 from public.menu_items m where m.location_id = l.id and lower(m.name) = lower(v.name));
