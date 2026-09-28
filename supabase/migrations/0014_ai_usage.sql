-- One row per AI request with tokens and estimated USD cost (spend meter + Autopilot budget).
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  model text not null,
  calls integer not null default 1,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  chat_id uuid,
  run_id uuid
);
alter table public.ai_usage enable row level security;
create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at desc);
