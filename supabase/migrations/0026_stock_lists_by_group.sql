-- 0026_stock_lists_by_group.sql — a bill item is "already on a list" when its group is (2026-10-17)
--
-- With inventory_items.same_as (0025), Oatly and Alpro oat milk are counted on one list line.
-- stock_ensure_item() used to add Oatly again on its next bill because Oatly itself was on no
-- list. Now it first looks for an active list item of any item in the same group.
-- Same function as 0022 otherwise. Safe to run twice.

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

  -- Already on a list (this item, or another item of its group, e.g. another brand of oat milk)?
  select si.id into existing
    from public.stock_items si
    join public.v_inventory_groups g on g.item_id = si.inventory_item_id
   where si.is_active and si.location_id = ii.location_id
     and g.group_id = (select x.group_id from public.v_inventory_groups x where x.item_id = ii.id)
   order by (si.inventory_item_id = ii.id) desc
   limit 1;
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
