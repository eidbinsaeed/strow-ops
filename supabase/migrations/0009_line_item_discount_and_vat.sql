-- 0009_line_item_discount_and_vat.sql
-- Per-line discount + VAT capture (adaptive). Applied to production 2026-07-10
-- via the Supabase MCP; committed here to keep the repo in sync.
--
-- Additive and safe: existing rows default to 0, so bills that do not separate
-- a discount or VAT are unaffected. VAT-inclusive paid = line_total + vat_amount.

alter table public.expense_line_items
  add column if not exists discount   numeric not null default 0,
  add column if not exists vat_amount numeric not null default 0;

comment on column public.expense_line_items.discount is
  'Per-line discount amount if the receipt itemizes one (else 0). line_total is already net of this.';
comment on column public.expense_line_items.vat_amount is
  'Per-line VAT amount if the receipt separates VAT (else 0). VAT-inclusive paid = line_total + vat_amount.';
