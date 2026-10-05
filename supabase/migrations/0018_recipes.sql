-- 0018_recipes.sql
-- Menu items + recipes, costed live from the latest purchase prices.
--
-- Additive only: two new tables, two pure unit helpers and three read-only
-- views. Nothing existing is altered.
--
-- How cost works
--   v_item_unit_cost     latest purchase of each inventory item, as AED per kg / L / pc
--                        (before VAT; VAT-inclusive also given). Uses the measured
--                        base_qty of the bill line, or quantity x the item's pack size;
--                        cup + lid sets are priced per set.
--   v_recipe_line_costs  each recipe line: qty x unit factor x that unit cost. Falls
--                        back to the owner's manual cost when there is no usable price.
--   v_menu_item_costs    per menu item: cost, price before VAT, profit, margin %.
-- Margin is before VAT on both sides (input VAT is reclaimed, output VAT is the FTA's).

-- ---------------------------------------------------------------- unit helpers
create or replace function public.uom_base(u text)
returns text
language sql immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(u, '')))
    when 'kg' then 'kg' when 'kgs' then 'kg' when 'kilo' then 'kg'
    when 'g' then 'kg' when 'gm' then 'kg' when 'gr' then 'kg' when 'gram' then 'kg' when 'grams' then 'kg'
    when 'mg' then 'kg' when 'lb' then 'kg'
    when 'l' then 'L' when 'lt' then 'L' when 'ltr' then 'L' when 'litre' then 'L' when 'liter' then 'L'
    when 'ml' then 'L' when 'cl' then 'L'
    when 'pcs' then 'pcs' when 'pc' then 'pcs' when 'piece' then 'pcs' when 'pieces' then 'pcs'
    when 'unit' then 'pcs' when 'units' then 'pcs'
    else null
  end
$$;

create or replace function public.uom_factor(u text)
returns numeric
language sql immutable
set search_path = ''
as $$
  select (case lower(trim(coalesce(u, '')))
    when 'kg' then 1 when 'kgs' then 1 when 'kilo' then 1
    when 'g' then 0.001 when 'gm' then 0.001 when 'gr' then 0.001 when 'gram' then 0.001 when 'grams' then 0.001
    when 'mg' then 0.000001 when 'lb' then 0.453592
    when 'l' then 1 when 'lt' then 1 when 'ltr' then 1 when 'litre' then 1 when 'liter' then 1
    when 'ml' then 0.001 when 'cl' then 0.01
    when 'pcs' then 1 when 'pc' then 1 when 'piece' then 1 when 'pieces' then 1
    when 'unit' then 1 when 'units' then 1
    else null
  end)::numeric
$$;

comment on function public.uom_base(text) is 'Purchase base unit (kg, L or pcs) for a recipe/pack unit such as g, ml, kg, L, pcs. NULL if unknown.';
comment on function public.uom_factor(text) is 'Multiplier from a unit to its base unit: g -> 0.001 (kg), ml -> 0.001 (L), pcs -> 1.';

-- ---------------------------------------------------------------- tables
create table if not exists public.menu_items (
  id               uuid primary key default uuid_generate_v4(),
  location_id      uuid not null references public.locations(id),
  name             text not null,
  section          text,
  price            numeric check (price is null or price >= 0),
  method           text,
  is_active        boolean not null default true,
  source           text not null default 'manual' check (source in ('manual', 'photo', 'text', 'ai')),
  photo_drive_url  text,
  photo_drive_path text,
  pos_external_id  text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.menu_items is 'What Qave sells. price = menu price incl. VAT. method = preparation steps from the recipe card. Recipe in recipe_lines; live cost and margin in v_menu_item_costs.';
comment on column public.menu_items.source is 'How the recipe was entered: manual, photo (handwritten card read by AI), text (typed and read by AI), ai (Strow AI chat).';
comment on column public.menu_items.pos_external_id is 'Forward hook: the POS item id, once the POS API is connected (sales x recipe = consumption).';

create unique index if not exists uniq_menu_items_location_name on public.menu_items (location_id, lower(name));

create table if not exists public.recipe_lines (
  id                uuid primary key default uuid_generate_v4(),
  menu_item_id      uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id),
  label             text,
  as_written        text,
  qty               numeric not null check (qty > 0),
  uom               text not null check (public.uom_base(uom) is not null),
  manual_unit_cost  numeric check (manual_unit_cost is null or manual_unit_cost >= 0),
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint recipe_lines_item_or_label check (inventory_item_id is not null or nullif(trim(label), '') is not null)
);

comment on table public.recipe_lines is 'One ingredient of a menu item: qty + uom (g, ml, pcs, kg, L) of an inventory item. label is used when no inventory item is linked (e.g. Ice).';
comment on column public.recipe_lines.as_written is 'The line exactly as written on the recipe card or typed text (audit trail for the AI read).';
comment on column public.recipe_lines.manual_unit_cost is 'Owner-entered AED per kg / L / pc. Used only when there is no usable purchase price. 0 = free (ice, tap water).';

create index if not exists idx_recipe_lines_menu_item on public.recipe_lines (menu_item_id, position);
create index if not exists idx_recipe_lines_inventory_item on public.recipe_lines (inventory_item_id);

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();
drop trigger if exists trg_recipe_lines_updated_at on public.recipe_lines;
create trigger trg_recipe_lines_updated_at before update on public.recipe_lines
  for each row execute function public.set_updated_at();

alter table public.menu_items enable row level security;
alter table public.recipe_lines enable row level security;

drop policy if exists owners_full_access_menu_items on public.menu_items;
create policy owners_full_access_menu_items on public.menu_items
  for all using (public.is_owner()) with check (public.is_owner());
drop policy if exists owners_full_access_recipe_lines on public.recipe_lines;
create policy owners_full_access_recipe_lines on public.recipe_lines
  for all using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- views
create or replace view public.v_item_unit_cost
with (security_invoker = true) as
with lines as (
  select
    li.inventory_item_id,
    li.id                                              as line_id,
    e.expense_date,
    li.created_at,
    s.name                                             as supplier_name,
    li.description,
    li.line_total::numeric                             as net_total,
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
    and e.status <> 'rejected'
    and li.line_total > 0
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

comment on view public.v_item_unit_cost is 'Latest purchase price per inventory item: unit_cost = AED per base_uom (kg, L or pcs) before VAT; unit_cost_paid incl. VAT; prev_unit_cost = the buy before, same unit.';

create or replace view public.v_recipe_line_costs
with (security_invoker = true) as
select
  rl.id,
  rl.menu_item_id,
  rl.position,
  rl.inventory_item_id,
  coalesce(i.name, rl.label)            as ingredient,
  rl.label,
  rl.as_written,
  rl.qty,
  rl.uom,
  public.uom_base(rl.uom)               as base_uom,
  rl.qty * public.uom_factor(rl.uom)    as base_qty,
  c.base_uom                            as cost_uom,
  c.unit_cost                           as purchase_unit_cost,
  c.prev_unit_cost,
  c.last_bought,
  c.supplier_name,
  rl.manual_unit_cost,
  case
    when c.unit_cost is not null and c.base_uom = public.uom_base(rl.uom) then 'purchase'
    when rl.manual_unit_cost is not null then 'manual'
    when rl.inventory_item_id is null then 'no_item'
    when c.unit_cost is null then 'no_price'
    else 'unit_mismatch'
  end as cost_source,
  case
    when c.unit_cost is not null and c.base_uom = public.uom_base(rl.uom)
      then round(rl.qty * public.uom_factor(rl.uom) * c.unit_cost, 4)
    when rl.manual_unit_cost is not null
      then round(rl.qty * public.uom_factor(rl.uom) * rl.manual_unit_cost, 4)
  end as line_cost
from public.recipe_lines rl
left join public.inventory_items i  on i.id = rl.inventory_item_id
left join public.v_item_unit_cost c on c.inventory_item_id = rl.inventory_item_id;

comment on view public.v_recipe_line_costs is 'Each recipe line with its live cost (AED, before VAT). cost_source: purchase | manual | no_item | no_price | unit_mismatch (line_cost NULL for the last three).';

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
    then round(100 * (1 - sum(l.line_cost) / (m.price / (1 + loc.vat_rate))), 1) end as margin_pct
from public.menu_items m
join public.locations loc on loc.id = m.location_id
left join public.v_recipe_line_costs l on l.menu_item_id = m.id
group by m.id, loc.vat_rate;

comment on view public.v_menu_item_costs is 'Per menu item: cost of its recipe, price before VAT, profit and margin % (both before VAT). profit/margin NULL until at least one line is priced; costed_count < ingredient_count means some lines have no price yet.';
