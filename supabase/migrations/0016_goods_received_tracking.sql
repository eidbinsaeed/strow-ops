-- Goods received tracking: supplier contacts, bill document details,
-- per-line pack structure and base-unit quantities (L / kg / pcs).
-- Applied to production via Supabase MCP on 2026-09-29.

alter table suppliers
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text;

alter table expenses
  add column if not exists doc_type text,
  add column if not exists order_ref text,
  add column if not exists salesperson text,
  add column if not exists payment_terms text;

alter table expense_line_items
  add column if not exists line_kind text not null default 'goods',
  add column if not exists brand text,
  add column if not exists uom_printed text,
  add column if not exists pack_qty numeric,
  add column if not exists pack_type text,
  add column if not exists units_per_pack numeric,
  add column if not exists count_qty numeric,
  add column if not exists count_uom text,
  add column if not exists unit_size numeric,
  add column if not exists size_uom text,
  add column if not exists base_qty numeric,
  add column if not exists base_uom text,
  add column if not exists vat_rate numeric;

alter table expense_line_items drop constraint if exists expense_line_items_line_kind_chk;
alter table expense_line_items add constraint expense_line_items_line_kind_chk
  check (line_kind in ('goods','fee','discount','deposit','other'));

alter table inventory_items
  add column if not exists base_uom text,
  add column if not exists brand text;

create or replace view v_goods_received with (security_invoker = true) as
select
  li.inventory_item_id,
  e.location_id,
  li.base_uom,
  count(*)                                       as buys,
  sum(li.base_qty)                               as base_qty,
  sum(li.count_qty)                              as count_qty,
  sum(li.line_total + coalesce(li.vat_amount,0)) as spend,
  case when sum(li.base_qty) > 0
       then sum(li.line_total + coalesce(li.vat_amount,0)) / sum(li.base_qty) end as cost_per_base,
  max(e.expense_date)                            as last_received
from expense_line_items li
join expenses e on e.id = li.expense_id
where li.line_kind = 'goods' and li.inventory_item_id is not null and li.base_qty is not null
group by li.inventory_item_id, e.location_id, li.base_uom;
