-- 0021_stock_counts.sql — staff stock counts (2026-10-14)
--
-- Shop stock: staff count what is in the shop every day (with what was thrown away).
-- Store room: staff count the store room once a week.
-- The owner keeps the two count lists (item, unit, minimum, usual order) on /owner/stock;
-- an item below its minimum goes on the order list, or "move from the store room" when the
-- store room has it. A list item may link to an inventory item: with base_per_unit it turns
-- counts into the POS recipe units, so the owner page can show days of stock left.
--
-- Additive only (no drops, so the Supabase MCP can apply it): three new tables, one view,
-- RLS like the other owner tables, and a seed of the two lists (only when stock_items is
-- empty). Safe to run twice.

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  place text not null check (place in ('shop', 'store')),
  name text not null check (length(btrim(name)) between 1 and 80),
  unit_label text not null default 'pieces',          -- what staff count in: bottles, kg, boxes of 12
  step numeric not null default 1 check (step > 0),    -- the + / − step on the shop screen
  min_qty numeric check (min_qty is null or min_qty >= 0),
  reorder_qty numeric check (reorder_qty is null or reorder_qty > 0),
  grp text not null default 'Other',                   -- heading on the count screen
  sort int not null default 0,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  base_per_unit numeric check (base_per_unit is null or base_per_unit > 0), -- recipe base units per counted unit
  supplier_id uuid references public.suppliers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uniq_stock_items_active_name
  on public.stock_items (location_id, place, lower(btrim(name))) where is_active;
create index if not exists idx_stock_items_place on public.stock_items (location_id, place, sort);

create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete restrict,
  place text not null check (place in ('shop', 'store')),
  barista_id uuid references public.baristas(id) on delete set null,
  counted_on date not null,                            -- Dubai day
  counted_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_stock_counts_recent on public.stock_counts (location_id, place, counted_at desc);

create table if not exists public.stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.stock_counts(id) on delete cascade,
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  qty numeric not null check (qty >= 0),
  wasted numeric check (wasted is null or wasted > 0),
  waste_reason text check (waste_reason is null or waste_reason in ('expired', 'spoiled', 'broken', 'other')),
  unique (count_id, stock_item_id)
);
create index if not exists idx_stock_count_lines_item on public.stock_count_lines (stock_item_id);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_stock_items_updated_at') then
    create trigger trg_stock_items_updated_at before update on public.stock_items
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- Latest count of every active list item (null qty = never counted).
create or replace view public.v_stock_levels with (security_invoker = true) as
select
  si.id, si.location_id, si.place, si.name, si.unit_label, si.step, si.min_qty, si.reorder_qty,
  si.grp, si.sort, si.inventory_item_id, si.base_per_unit, si.supplier_id,
  l.qty, l.counted_on, l.counted_at, l.barista_name,
  (l.qty is not null and si.min_qty is not null and l.qty < si.min_qty) as is_low
from public.stock_items si
left join lateral (
  select cl.qty, c.counted_on, c.counted_at, b.name as barista_name
  from public.stock_count_lines cl
  join public.stock_counts c on c.id = cl.count_id
  left join public.baristas b on b.id = c.barista_id
  where cl.stock_item_id = si.id
  order by c.counted_at desc
  limit 1
) l on true
where si.is_active;

alter table public.stock_items enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
do $$
declare t text;
begin
  foreach t in array array['stock_items', 'stock_counts', 'stock_count_lines'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'owners_full_access_' || t) then
      execute format('create policy %I on public.%I for all using (public.is_owner()) with check (public.is_owner())', 'owners_full_access_' || t, t);
    end if;
  end loop;
end $$;

-- Seed the two lists from the store-room lists staff post in the team chat and the POS recipes.
insert into public.stock_items (location_id, place, grp, sort, name, unit_label, step, min_qty, reorder_qty, inventory_item_id, base_per_unit, supplier_id)
select loc.id, v.place, v.grp, v.sort, v.name, v.unit, v.step, v.min_qty, v.reorder_qty, ii.id, v.bpu, s.id
from (values
  ('shop', 'Milk & cream', 10, 'Fresh milk (Al Rawabi 2 L)', '2 L bottles', 1, 2, null, 'Milk — Full Cream 2L', 2, 'Al Rawabi Dairy Company L.L.C.'),
  ('shop', 'Milk & cream', 20, 'Long-life milk 1 L', 'bottles', 1, 6, null, 'Al Ain Farms UHT Full Cream Milk', 1, null),
  ('shop', 'Milk & cream', 30, 'Oat milk · Alpro 1 L', 'bottles', 1, 4, null, 'Oat Milk — Alpro Barista 1L', 1, null),
  ('shop', 'Milk & cream', 40, 'Coconut milk · Alpro 1 L', 'bottles', 1, 2, null, 'Alpro Coconut Barista Pro - 12x1ltr', 1, null),
  ('shop', 'Milk & cream', 50, 'Almond milk · Alpro 1 L', 'bottles', 1, 2, null, 'Almond Milk — Alpro Barista 1L', 1, null),
  ('shop', 'Milk & cream', 60, 'Lactose-free milk 1 L', 'bottles', 1, 2, null, 'Almarai UHT Milk Lacto Free 1lt', 1, null),
  ('shop', 'Milk & cream', 70, 'Mactop cream 1 L', 'bottles', 1, 2, null, null, null, null),
  ('shop', 'Milk & cream', 80, 'Condensed milk 370 g', 'tins', 1, 6, null, 'Nestlé Sweetened Condensed Milk 370g', 0.37, null),
  ('shop', 'Coffee', 110, 'Brazil beans', 'kg, bags + hopper', 0.5, 1, null, 'Coffee Beans — Brazil Cerrado 1kg', 1, 'La Marquise International'),
  ('shop', 'Coffee', 120, 'Ethiopian beans', 'kg', 0.5, 0.5, null, 'Coffee Beans — Ethiopia Worka Chelbesa Gedeb Natural 1kg', 1, 'La Marquise International'),
  ('shop', 'Açaí & bases', 210, 'Açaí purée 3.2 kg', 'tubs', 0.5, 1, null, 'Acai Puree — Montone 3.2kg', 3.2, 'Amazonas 4U'),
  ('shop', 'Açaí & bases', 220, 'Peanut butter cream 3 kg', 'tubs', 0.5, 1, null, 'Peanut Butter Cream 3kg', 3, 'Montone Trading LLC'),
  ('shop', 'Açaí & bases', 230, 'Frozen strawberry 2.5 kg', 'packs', 1, 1, null, 'Strawberry — frozen 2.5kg', 2.5, null),
  ('shop', 'Desserts', 310, 'Raspberry cheesecake', 'pieces', 1, 6, null, 'Crinkle Cheesecake (slice)', 1, 'Crinkle'),
  ('shop', 'Desserts', 320, 'Nutella babka', 'pieces', 1, 6, null, 'Nutella Babka (box of 12)', 1, null),
  ('shop', 'Desserts', 330, 'Asida', 'pieces', 1, 6, null, null, null, null),
  ('shop', 'Desserts', 340, 'NY cookies', 'pieces', 1, 6, null, 'NY Cookies — frozen (pc)', 1, null),
  ('shop', 'Desserts', 350, 'Croissants', 'pieces', 1, 4, null, 'Croissant plain', 1, 'SIDCO FOODS TRADING LLC'),
  ('shop', 'Cups & holders', 410, 'Paper cups 8 oz', 'sleeves of 50', 1, 2, null, 'Paper Cup 8oz — double wall, printed + lid', 50, null),
  ('shop', 'Cups & holders', 420, 'Paper cups 6.5 oz', 'sleeves of 50', 1, 1, null, 'Paper Cup 6.5oz — double wall, printed + lid', 50, null),
  ('shop', 'Cups & holders', 430, 'Clear cups 14 oz', 'sleeves of 50', 1, 2, null, 'Cups 14oz — PET printed', 50, null),
  ('shop', 'Cups & holders', 440, 'Drink holders', 'pieces', 5, 20, null, null, null, null),
  ('store', 'Freezer · bakery & desserts', 10, 'Cheese croissants', 'pieces', 1, 6, 24, 'Croissant cheese', 1, 'SIDCO FOODS TRADING LLC'),
  ('store', 'Freezer · bakery & desserts', 20, 'Plain croissants', 'pieces', 1, 6, 24, 'Croissant plain', 1, 'SIDCO FOODS TRADING LLC'),
  ('store', 'Freezer · bakery & desserts', 30, 'Asida', 'boxes of 12', 1, 1, 3, null, null, null),
  ('store', 'Freezer · bakery & desserts', 40, 'Basbousa', 'boxes of 12', 1, 1, 3, null, null, null),
  ('store', 'Freezer · bakery & desserts', 50, 'Nutella cookies', 'boxes of 12', 1, 1, 2, 'Frozen Nutella Cookies', 12, null),
  ('store', 'Freezer · bakery & desserts', 60, 'Kinder cookies', 'boxes of 12', 1, 1, 2, 'Frozen Kinder Cookies', 12, null),
  ('store', 'Dry shelf · coffee & baking', 110, 'Brazil beans', 'kg', 1, 3, 10, 'Coffee Beans — Brazil Cerrado 1kg', 1, 'La Marquise International'),
  ('store', 'Dry shelf · coffee & baking', 120, 'Ethiopian beans', 'kg', 1, 1, 3, 'Coffee Beans — Ethiopia Worka Chelbesa Gedeb Natural 1kg', 1, 'La Marquise International'),
  ('store', 'Dry shelf · coffee & baking', 130, 'Chocolate chips', '5 kg packs', 1, 1, 1, 'HERCO Milk Choco Nuggets 5kg', 5, null),
  ('store', 'Milk shelf', 210, 'Coconut milk · Alpro', 'litres', 1, 4, 12, 'Alpro Coconut Barista Pro - 12x1ltr', 1, null),
  ('store', 'Milk shelf', 220, 'Oat milk · Alpro', 'litres', 1, 8, 12, 'Oat Milk — Alpro Barista 1L', 1, null),
  ('store', 'Milk shelf', 230, 'Long-life milk', 'litres', 1, 6, 12, 'Al Ain Farms UHT Full Cream Milk', 1, null),
  ('store', 'Milk shelf', 240, 'Mactop cream', 'litres', 1, 12, 36, null, null, null),
  ('store', 'Milk shelf', 250, 'Condensed milk 370 g', 'tins', 1, 12, 48, 'Nestlé Sweetened Condensed Milk 370g', 0.37, null),
  ('store', 'Supplies', 310, 'Hand gloves', 'boxes', 1, 3, 10, 'Vinyl Gloves — M, black, powder-free (100pc)', null, null),
  ('store', 'Supplies', 320, 'Tissue napkins', 'packs', 1, 3, 10, 'Paper Napkins — brown 23×23cm 2-ply (20×100)', null, null),
  ('store', 'Supplies', 330, 'Maxi roll', 'rolls', 1, 2, 6, 'Maxi Roll (2ply)', null, null),
  ('store', 'Supplies', 340, 'Paper cups 8 oz', 'rolls of 50', 1, 4, 10, 'Paper Cup 8oz — double wall, printed + lid', 50, null),
  ('store', 'Supplies', 350, 'Clear cups 14 oz, printed', 'packs', 1, 2, 4, 'Cups 14oz — PET printed', null, null),
  ('store', 'Supplies', 360, 'Clear cups 14 oz, plain', 'boxes', 1, 1, 1, null, null, null),
  ('store', 'Supplies', 370, 'Drink holder, 2 cups', 'pieces', 10, 50, 200, null, null, null),
  ('store', 'Supplies', 380, 'Drink holder, 4 cups', 'pieces', 10, 50, 200, null, null, null)
) as v(place, grp, sort, name, unit, step, min_qty, reorder_qty, item_name, bpu, supplier_name)
cross join (select id from public.locations where is_active limit 1) loc
left join lateral (select i.id from public.inventory_items i where i.name = v.item_name and i.is_active limit 1) ii on true
left join lateral (select x.id from public.suppliers x where x.name = v.supplier_name limit 1) s on true
where not exists (select 1 from public.stock_items);
