-- 0028 — Charts and tables pinned from Strow AI to Home.
-- A pin keeps the block as it was shown (the snapshot) and, when the AI gave
-- one, the read-only SQL that rebuilds it. Home re-runs that SQL through
-- ai_read_query on every load, so a pinned "sales per week" stays current.
-- Owner-only (service role); not visible to the AI's schema map (ai_ prefix).
-- Additive only.

create table if not exists public.ai_pins (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('chart', 'table')),
  title text not null default '',
  block jsonb not null,
  source_sql text,
  chat_id uuid references public.ai_chats(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_pins_order_idx on public.ai_pins (position, created_at);

alter table public.ai_pins enable row level security;

comment on table public.ai_pins is 'Charts/tables the owner pinned from Strow AI to the Home page.';
comment on column public.ai_pins.block is 'The chart or table block as shown in the chat (used as-is when there is no source_sql, or it fails).';
comment on column public.ai_pins.source_sql is 'Read-only SELECT that rebuilds the block (chart: column "label" + one column per series name; table: one column per column title). NULL = snapshot.';
