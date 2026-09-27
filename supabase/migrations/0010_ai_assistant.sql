-- 0010_ai_assistant.sql
-- Strow AI: built-in assistant + Autopilot.
--
--   ai_runs      one row per Autopilot sweep / triggered check
--   ai_actions   every change the AI made or proposes (ops + before-state => one-tap Undo)
--   ai_memory    what the AI has learned (supplier layouts, price norms, owner preferences)
--   ai_chats / ai_messages   owner <-> assistant conversations (blocks incl. charts)
--
-- All tables: RLS on, no policies => service role only (server routes).

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null default 'running' check (status in ('running','done','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary text,
  stats jsonb not null default '{}'::jsonb,
  model text
);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'chat' check (source in ('chat','autopilot','owner')),
  status text not null default 'proposed'
    check (status in ('proposed','applied','undone','rejected','failed','info')),
  severity text not null default 'info' check (severity in ('info','warn','critical')),
  title text not null,
  detail text,
  confidence numeric,
  ops jsonb not null default '[]'::jsonb,
  before jsonb,
  error text,
  entity_table text,
  entity_id uuid,
  run_id uuid references public.ai_runs(id) on delete set null,
  chat_id uuid,
  applied_at timestamptz,
  undone_at timestamptz,
  decided_at timestamptz
);
create index if not exists ai_actions_status_created_idx on public.ai_actions (status, created_at desc);
create index if not exists ai_actions_entity_idx on public.ai_actions (entity_table, entity_id);

create table if not exists public.ai_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scope text not null default 'general',
  subject text,
  note text not null,
  source text not null default 'ai' check (source in ('ai','owner')),
  is_active boolean not null default true
);

create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.ai_chats(id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null check (role in ('user','assistant')),
  blocks jsonb not null default '[]'::jsonb,
  text text
);
create index if not exists ai_messages_chat_idx on public.ai_messages (chat_id, created_at);

alter table public.ai_runs enable row level security;
alter table public.ai_actions enable row level security;
alter table public.ai_memory enable row level security;
alter table public.ai_chats enable row level security;
alter table public.ai_messages enable row level security;

comment on table public.ai_actions is 'Every change the Strow AI made or proposes. ops + before => Undo.';
comment on table public.ai_memory is 'What the Strow AI has learned: supplier invoice layouts, price norms, owner preferences.';

-- ---------------------------------------------------------------------------
-- Read-only query gateway. The assistant can SELECT anything in Strow, but
-- cannot write through this path, cannot see other projects sharing this DB,
-- and every call is time-boxed.
-- ---------------------------------------------------------------------------
create or replace function public.ai_read_query(q text, max_rows int default 300)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cleaned text := regexp_replace(btrim(q), ';\s*$', '');
  low text := lower(regexp_replace(btrim(q), ';\s*$', ''));
  result jsonb;
begin
  if low !~ '^\s*(select|with)\M' then
    raise exception 'Only SELECT / WITH queries are allowed';
  end if;
  if position(';' in cleaned) > 0 then
    raise exception 'Only one statement is allowed';
  end if;
  if low ~ '\m(insert|update|delete|merge|drop|alter|create|grant|revoke|truncate|copy|call|execute|vacuum|refresh|set_config|pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink|pg_terminate_backend|pg_cancel_backend)\M' then
    raise exception 'That keyword is not allowed in assistant queries';
  end if;
  if low ~ '\m(wellnav_[a-z0-9_]*|eidhub_[a-z0-9_]*|game_assets|supra_build_costs|backup_[a-z0-9_]*)\M'
     or low ~ '\m(auth|storage|vault|extensions|supabase_functions|net|cron)\.' then
    raise exception 'That table is outside Strow and not available to the assistant';
  end if;

  perform set_config('statement_timeout', '8000', true);
  perform set_config('transaction_read_only', 'on', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) as ai_q limit %s) t',
    cleaned,
    greatest(1, least(coalesce(max_rows, 300), 1000))
  ) into result;
  return result;
end;
$$;

revoke all on function public.ai_read_query(text, int) from public, anon, authenticated;
grant execute on function public.ai_read_query(text, int) to service_role;

-- Compact schema map for the assistant's system prompt.
create or replace function public.ai_schema()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tables', (
      select jsonb_object_agg(table_name, cols)
      from (
        select c.table_name,
               string_agg(
                 c.column_name || ':' ||
                 case when c.data_type = 'USER-DEFINED' then c.udt_name else c.data_type end,
                 ', ' order by c.ordinal_position
               ) as cols
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name !~ '^(wellnav_|eidhub_|backup_|ai_)'
          and c.table_name not in ('game_assets', 'supra_build_costs')
        group by c.table_name
      ) s
    ),
    'enums', (
      select jsonb_object_agg(typname, labels)
      from (
        select t.typname, jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
        group by t.typname
      ) en
    )
  );
$$;

revoke all on function public.ai_schema() from public, anon, authenticated;
grant execute on function public.ai_schema() to service_role;
