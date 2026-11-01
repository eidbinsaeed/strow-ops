-- 0031 · App prices only count from the day each app's prices changed (1 Nov 2026)
--
-- 0029 valued every October app order at today's app prices. That was wrong: the apps
-- moved to these prices on different days, and before that the POS price was right.
-- The POS shows when: staff ring an app order above the shop price only once the app's
-- price is higher.
--   Talabat: new prices from 13 Oct 2026 (from that day the marked-up POS totals equal
--            today's Talabat prices exactly; before it, Talabat was about the shop price).
--   Keeta:   from 28 Oct 2026 (first marked-up Keeta order; the owner raised Keeta ~20% late Oct).
--   Beanz:   not known yet; from 1 Nov 2026, the day the owner said Beanz matches Talabat.
-- Before an app's date, its orders count exactly as rung in the POS.

create table if not exists public.app_price_start (
  location_id uuid not null references public.locations(id),
  app         text not null check (app in ('talabat', 'keeta', 'beanz')),
  starts_on   date not null,
  note        text,
  primary key (location_id, app)
);
alter table public.app_price_start enable row level security;
comment on table public.app_price_start is
  'The day each delivery app started selling at menu_items.app_price. App orders before it count as rung in the POS.';

insert into public.app_price_start (location_id, app, starts_on, note)
select l.id, v.app, v.d, v.note
from public.locations l
cross join (values
  ('talabat', date '2026-10-13', 'Marked-up Talabat totals match today''s prices from 13 Oct'),
  ('keeta',   date '2026-10-28', 'First marked-up Keeta order 28 Oct; raised ~20% late Oct'),
  ('beanz',   date '2026-11-01', 'Owner said on 1 Nov Beanz matches Talabat; real date not known yet')
) as v(app, d, note)
where l.slug = 'qave_main'
on conflict (location_id, app) do update set starts_on = excluded.starts_on, note = excluded.note;

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
  l.id,
  l.location_id,
  l.business_date,
  l.order_id,
  max(l.paid_at)                                         as paid_at,
  l.payment_method                                       as app,
  max(l.total_paid)                                      as pos_paid,
  round(sum(l.qty * coalesce(l.app_price, l.price)), 2)  as app_value,
  bool_and(l.menu_item_id is not null)                   as all_matched,
  bool_or(l.app_price is not null)                       as has_app_price,
  case
    when max(l.total_paid) <= 0 then max(l.total_paid)
    when s.starts_on is null or l.business_date < s.starts_on then max(l.total_paid)
    when bool_and(l.menu_item_id is not null) and bool_or(l.app_price is not null)
      then greatest(max(l.total_paid), round(sum(l.qty * coalesce(l.app_price, l.price)), 2))
    else max(l.total_paid)
  end                                                    as app_sales,
  jsonb_agg(jsonb_build_object('item', l.item, 'qty', l.qty, 'shop', l.price, 'app', l.app_price)) as items,
  s.starts_on                                            as app_prices_from
from lines l
left join public.app_price_start s on s.location_id = l.location_id and s.app = l.payment_method
group by l.id, l.location_id, l.business_date, l.order_id, l.payment_method, s.starts_on;

comment on view public.v_pos_app_orders is
  'Each Talabat / Keeta / Beanz order from the POS: pos_paid = what the POS took, app_value = items × today''s app price, app_sales = what the customer paid on the app. Before the app''s app_prices_from date (app_price_start) app_sales = pos_paid; from it, the larger of pos_paid and app_value. Free orders stay 0; an order with an unknown item keeps the POS amount.';
