-- Orders per day from the POS report ("Total Transactions") and per payment method.
alter table public.closings
  add column if not exists transactions integer check (transactions is null or transactions >= 0),
  add column if not exists transactions_by_method jsonb;
