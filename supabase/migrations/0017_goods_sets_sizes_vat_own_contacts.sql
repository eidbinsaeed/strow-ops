-- Sets (cup + lid), remembered pack sizes, VAT mode/rounding, quotes, own contacts.
-- Applied to production via Supabase MCP on 2026-09-29.
alter table expense_line_items add column if not exists set_parts text[];
alter table inventory_items
  add column if not exists default_unit_size numeric,
  add column if not exists default_size_uom text;
alter table expenses
  add column if not exists goods_received boolean not null default true,
  add column if not exists vat_mode text,
  add column if not exists rounding numeric;
alter table locations add column if not exists own_contacts jsonb not null default '{"phones":[],"emails":[]}'::jsonb;
-- v_goods_received now also requires expenses.goods_received (see 0016 for the full view).
