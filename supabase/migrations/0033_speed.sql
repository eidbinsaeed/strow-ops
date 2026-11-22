-- 0033 — Speed (audit of 22 Nov 2026).
--
-- Additive only: indexes and one read-only view. No data changes, and no
-- existing table, view or function changes.
--
--   1. Matching POS sales to menu items through an index.
--   2. v_pos_latest_prices: each menu item's newest POS sales day in one small read.
--   3. An index on the 11 foreign keys that had none, on tables that hold data.

-- ---------------------------------------------------------------------------
-- 1. v_pos_product_sales (and v_pos_daily / v_pos_ingredient_usage, which read
--    through it) match every POS sale row to a menu item by normalised name.
--    With no index the database compared each sale with every menu item on
--    every read: 1,274 sales x 59 menu items, 0.4 s, on each Recipes page.
--    These two indexes let it look the name up instead. v_pos_app_orders
--    matches on the plain name as well, hence the second one.
--    (pos_norm is IMMUTABLE. If its definition ever changes, rebuild both:
--     reindex index menu_items_pos_key_idx; reindex index menu_items_pos_name_key_idx;)
-- ---------------------------------------------------------------------------
create index if not exists menu_items_pos_key_idx
  on public.menu_items (location_id, (public.pos_norm(coalesce(pos_name, name))));
create index if not exists menu_items_pos_name_key_idx
  on public.menu_items (location_id, (public.pos_norm(name)));

-- ---------------------------------------------------------------------------
-- 2. The recipe screens need one number per menu item: what the POS charged
--    on the newest day the item sold. They used to read every sale ever made,
--    1,000 rows per request, each request recomputing the whole match. Now the
--    database picks the newest day per item and returns one row per item.
--    Same rule as before: newest business_date that has a sale of the item,
--    quantities and gross of that day added up.
-- ---------------------------------------------------------------------------
create or replace view public.v_pos_latest_prices
with (security_invoker = true) as
select distinct on (d.menu_item_id)
       d.menu_item_id,
       d.business_date,
       d.qty,
       d.gross
  from (
        select s.menu_item_id,
               s.business_date,
               sum(s.qty) as qty,
               coalesce(sum(s.gross), 0) as gross
          from public.v_pos_product_sales s
         where s.menu_item_id is not null
         group by s.menu_item_id, s.business_date
       ) d
 order by d.menu_item_id, d.business_date desc;

comment on view public.v_pos_latest_prices is 'One row per menu item the POS has sold: its newest sales day, with that day''s quantity and gross (price = gross / qty, incl. VAT). Read by the recipe screens.';

revoke all on public.v_pos_latest_prices from anon, authenticated;
grant select on public.v_pos_latest_prices to service_role;

-- ---------------------------------------------------------------------------
-- 3. Foreign keys without an index (Postgres does not add these by itself).
--    The two POS tables get (location_id, business_date), like
--    pos_product_sales: it covers the foreign key and reads by date.
--    Left for when they are used: the staff tables that are still empty
--    (attendance_devices, attendance_punches, leave_requests,
--    disciplinary_actions, payroll_adjustments, staff_reports) and
--    ai_batches.chat_id (a few rows).
-- ---------------------------------------------------------------------------
create index if not exists idx_line_items_inventory_item on public.expense_line_items (inventory_item_id);
create index if not exists idx_ai_actions_run on public.ai_actions (run_id);
create index if not exists idx_stock_items_supplier on public.stock_items (supplier_id);
create index if not exists idx_inventory_items_same_as on public.inventory_items (same_as);
create index if not exists idx_inventory_items_location on public.inventory_items (location_id);
create index if not exists idx_pos_category_sales_date on public.pos_category_sales (location_id, business_date);
create index if not exists idx_pos_modifier_sales_date on public.pos_modifier_sales (location_id, business_date);
create index if not exists idx_ai_pins_chat on public.ai_pins (chat_id);
create index if not exists idx_stock_counts_barista on public.stock_counts (barista_id);
create index if not exists idx_finance_payments_location on public.finance_payments (location_id);
create index if not exists idx_fixed_costs_linked_barista on public.fixed_costs (linked_barista_id);

-- Fresh numbers for the planner, so it starts using the new name indexes at once.
analyze public.menu_items;

notify pgrst, 'reload schema';
