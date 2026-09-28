-- Result of reading the order count off each closing photo, so no photo is paid for twice.
create table if not exists public.closing_order_scans (
  closing_id uuid primary key references public.closings(id) on delete cascade,
  status text not null check (status in ('filled', 'not_pos', 'check', 'error')),
  reason text,
  read jsonb,
  scanned_at timestamptz not null default now()
);
alter table public.closing_order_scans enable row level security;
