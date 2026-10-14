-- 0022_stock_lists_from_bills.sql — every bought item on a count list; who may edit the lists (2026-10-14)
--
-- 1. baristas.can_edit_stock_lists — the owner picks which staff may change the count lists
--    (items, units, minimums, usual order). Off for everyone until switched on.
-- 2. stock_items.source — manual | seed | bill, so the app can show "added from a bill, no minimum yet".
-- 3. stock_ensure_item(): puts an inventory item on a count list if it is on none — called by a
--    trigger whenever a bill line is linked to an inventory item (staff scan, owner fix in Needs you,
--    Strow AI). Fresh things (dairy, produce, bakery…) go on the daily shop list, packaging and
--    cleaning on the store-room list, all under the heading "New from bills" with no minimum, so
--    nothing is ordered until someone sets one. Never raises: a bill can never fail because of it.
-- 4. Backfill: every item bought in the last 90 days or on two or more bills goes on a list now.
--
-- Additive only, safe to run twice.

alter table public.baristas add column if not exists can_edit_stock_lists boolean not null default false;
alter table public.stock_items add column if not exists source text not null default 'manual';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stock_items_source_check') then
    alter table public.stock_items add constraint stock_items_source_check check (source in ('manual', 'seed', 'bill'));
  end if;
end $$;
create index if not exists idx_stock_items_inventory on public.stock_items (inventory_item_id) where is_active;

-- What staff count the item in, from how the bill counted it ("carton" -> "cartons").
create or replace function public.stock_unit_label(count_uom text)
returns text
language sql immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(count_uom, '')))
    when 'kg' then 'kg' when 'kgs' then 'kg'
    when 'l' then 'litres' when 'lt' then 'litres' when 'ltr' then 'litres' when 'litre' then 'litres' when 'liter' then 'litres'
    when 'pcs' then 'pieces' when 'pc' then 'pieces' when 'piece' then 'pieces' when 'unit' then 'pieces' when 'each' then 'pieces'
    when 'can' then 'tins' when 'tin' then 'tins'
    when 'box' then 'boxes' when 'bunch' then 'bunches' when 'loaf' then 'loaves'
    when '' then 'pieces'
    else lower(trim(count_uom)) || case when lower(trim(count_uom)) like '%s' then '' else 's' end
  end
$$;

-- Daily shop list for fresh and bar items, the weekly store-room list for everything else.
create or replace function public.stock_place_for_kind(kind text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when lower(coalesce(kind, '')) in ('dairy', 'plant_milk', 'produce', 'bakery', 'food', 'beverage', 'ingredient', 'base', 'frozen_fruit', 'pantry')
    then 'shop' else 'store' end
$$;

create or replace function public.stock_ensure_item(p_inventory_item_id uuid, p_count_uom text, p_units_per_pack numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ii record;
  existing uuid;
  v_place text;
  v_unit text;
  v_bpu numeric;
  v_sort int;
  new_id uuid;
begin
  select id, location_id, name, kind, base_uom, default_unit_size, default_size_uom, is_active
    into ii from public.inventory_items where id = p_inventory_item_id;
  if ii.id is null or not ii.is_active then return null; end if;
  -- Not stock: fees, charges, unlabelled till codes, samples.
  if ii.name ~* '(\m(fee|fees|sample)\M|charge|unlabelled|deposit)' then return null; end if;

  -- Already on a list (by link, or by the same name)?
  select id into existing from public.stock_items
   where is_active and location_id = ii.location_id and inventory_item_id = ii.id limit 1;
  if existing is not null then return existing; end if;
  select id into existing from public.stock_items
   where is_active and location_id = ii.location_id and public.strow_norm(name) = public.strow_norm(ii.name) limit 1;
  if existing is not null then
    update public.stock_items set inventory_item_id = ii.id where id = existing and inventory_item_id is null;
    return existing;
  end if;

  v_place := public.stock_place_for_kind(ii.kind);
  v_unit := public.stock_unit_label(p_count_uom);
  -- Recipe units per counted unit, only when it is unambiguous: a single pack of a known size.
  v_bpu := null;
  if lower(trim(coalesce(p_count_uom, ''))) in ('kg', 'kgs', 'l', 'lt', 'ltr', 'litre', 'liter') then
    v_bpu := 1;
  elsif ii.base_uom in ('kg', 'L') and ii.default_unit_size > 0
        and public.uom_base(ii.default_size_uom) = ii.base_uom
        and (p_units_per_pack is null or p_units_per_pack <= 1) then
    v_bpu := ii.default_unit_size * public.uom_factor(ii.default_size_uom);
  elsif ii.base_uom = 'pcs' and (p_units_per_pack is null or p_units_per_pack <= 1) then
    v_bpu := 1;
  end if;

  select coalesce(max(sort), 0) + 10 into v_sort from public.stock_items
   where location_id = ii.location_id and place = v_place and is_active;

  insert into public.stock_items (location_id, place, name, unit_label, step, min_qty, reorder_qty, grp, sort, inventory_item_id, base_per_unit, source)
  values (ii.location_id, v_place, left(btrim(ii.name), 80), v_unit, 1, null, null, 'New from bills', v_sort, ii.id, v_bpu, 'bill')
  on conflict do nothing
  returning id into new_id;
  return new_id;
exception when others then
  return null;
end;
$$;
revoke execute on function public.stock_ensure_item(uuid, text, numeric) from anon, authenticated, public;
revoke execute on function public.stock_unit_label(text) from anon, authenticated, public;
revoke execute on function public.stock_place_for_kind(text) from anon, authenticated, public;

create or replace function public.trg_stock_from_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.inventory_item_id is null or coalesce(NEW.line_kind, 'goods') <> 'goods' then return NEW; end if;
  if TG_OP = 'UPDATE' and NEW.inventory_item_id is not distinct from OLD.inventory_item_id then return NEW; end if;
  perform public.stock_ensure_item(NEW.inventory_item_id, NEW.count_uom, NEW.units_per_pack);
  return NEW;
exception when others then
  return NEW;
end;
$$;
revoke execute on function public.trg_stock_from_line() from anon, authenticated, public;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_stock_from_line') then
    create trigger trg_stock_from_line
      after insert or update of inventory_item_id on public.expense_line_items
      for each row execute function public.trg_stock_from_line();
  end if;
end $$;

-- Backfill: items bought recently or more than once. Older one-off buys stay off the lists
-- (the owner can add them from Count lists).
do $$
declare r record;
begin
  for r in
    select li.inventory_item_id,
           mode() within group (order by li.count_uom) as count_uom,
           mode() within group (order by li.units_per_pack) as units_per_pack,
           count(distinct e.id) as bills,
           max(e.expense_date) as last_bought
    from public.expense_line_items li
    join public.expenses e on e.id = li.expense_id
    where li.inventory_item_id is not null
      and coalesce(li.line_kind, 'goods') = 'goods'
      and e.status <> 'rejected'
      and e.goods_received is not false
    group by li.inventory_item_id
  loop
    if r.bills >= 2 or r.last_bought >= current_date - 90 then
      perform public.stock_ensure_item(r.inventory_item_id, r.count_uom, r.units_per_pack);
    end if;
  end loop;
end $$;
