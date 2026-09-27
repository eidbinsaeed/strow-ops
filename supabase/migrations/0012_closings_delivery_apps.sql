-- Delivery/app split on the daily closing. online_total stays the sum, so grand_total (generated) and all views are unchanged.
alter table public.closings
  add column if not exists talabat_total numeric,
  add column if not exists keeta_total numeric,
  add column if not exists beanz_total numeric;
