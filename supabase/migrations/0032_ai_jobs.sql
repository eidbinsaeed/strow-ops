-- 0032 — Strow AI works in the background.
--
-- Until now an AI run lived inside the web request of the page that started
-- it: leave the page and the progress (and sometimes the run) was gone. Now
-- every run is a row in ai_jobs. The server works on it whether or not a
-- screen is open, saves its steps as it goes, and any screen can show it.
--
--   ai_jobs     one AI run: a chat message ("chat"), or one Needs-you item
--               handed to the AI ("item"). queued -> running -> done / failed / canceled.
--   ai_batches  "Let the AI handle all": the items handed over together, and
--               the chat their answers go into.
--
-- Item jobs run one after another (one lane), so two runs never fix the same
-- bill or create the same new item twice. Chat jobs start at once.
--
-- All tables: RLS on, no policies => service role only (server routes), same
-- as the other ai_ tables. Additive only: nothing existing changes.

create table if not exists public.ai_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  chat_id uuid references public.ai_chats(id) on delete set null,
  total integer not null default 0,
  finished_at timestamptz,
  summary text
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null default 'chat' check (kind in ('chat', 'item')),
  mode text not null default 'chat' check (mode in ('chat', 'finance')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  chat_id uuid references public.ai_chats(id) on delete cascade,
  batch_id uuid references public.ai_batches(id) on delete cascade,
  action_id uuid,
  position integer not null default 0,
  title text,
  prompt text not null,
  page text,
  cancel_requested boolean not null default false,
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  status_text text,
  steps jsonb not null default '[]'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  outcome text,
  summary text,
  error text,
  model text,
  stats jsonb not null default '{}'::jsonb
);

create index if not exists ai_jobs_open_idx on public.ai_jobs (created_at, position) where status in ('queued', 'running');
create index if not exists ai_jobs_chat_idx on public.ai_jobs (chat_id, created_at);
create index if not exists ai_jobs_action_idx on public.ai_jobs (action_id, created_at desc) where action_id is not null;
create index if not exists ai_jobs_batch_idx on public.ai_jobs (batch_id, position) where batch_id is not null;

alter table public.ai_batches enable row level security;
alter table public.ai_jobs enable row level security;
grant select, insert, update, delete on public.ai_batches, public.ai_jobs to service_role;

comment on table public.ai_jobs is 'One Strow AI run (a chat message, or a Needs-you item handed to the AI). The server works on it in the background and saves its steps here.';
comment on column public.ai_jobs.action_id is 'item jobs: the open ai_actions row (Needs you) this run handles.';
comment on column public.ai_jobs.heartbeat_at is 'Touched every few seconds while a run is alive. A running job with an old heartbeat was cut off and is closed as interrupted.';
comment on column public.ai_jobs.outcome is 'item jobs: fixed | closed | needs_you | failed | canceled.';
comment on table public.ai_batches is 'Needs-you items handed to the AI together ("Let the AI handle all") and the chat their answers go into.';

-- ---------------------------------------------------------------------------
-- Take the next waiting job, if the lane is free. One caller at a time; a
-- running job whose heartbeat stopped (its server run was cut off) no longer
-- holds the lane. The owner's message for the job is written in the same
-- step, so a screen never sees a running job without its question.
-- ---------------------------------------------------------------------------
create or replace function public.ai_claim_job(p_stale_seconds integer default 75)
returns setof public.ai_jobs
language plpgsql
set search_path = public, pg_temp
as $$
declare
  j public.ai_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('strow_ai_jobs_claim'));

  if exists (
    select 1
      from public.ai_jobs
     where status = 'running'
       and kind = 'item'
       and coalesce(heartbeat_at, started_at, created_at) > now() - make_interval(secs => greatest(coalesce(p_stale_seconds, 75), 20))
  ) then
    return;
  end if;

  select * into j
    from public.ai_jobs
   where status = 'queued'
   order by created_at, position, id
   limit 1
   for update skip locked;
  if not found then
    return;
  end if;

  update public.ai_jobs
     set status = 'running', started_at = now(), heartbeat_at = now()
   where id = j.id
  returning * into j;

  if j.chat_id is not null then
    insert into public.ai_messages (chat_id, role, blocks, text)
    values (
      j.chat_id,
      'user',
      jsonb_build_array(jsonb_build_object('type', 'text', 'text', coalesce(nullif(j.title, ''), j.prompt))),
      j.prompt
    );
    update public.ai_chats set updated_at = now() where id = j.chat_id;
  end if;

  return next j;
end;
$$;

-- ---------------------------------------------------------------------------
-- Close a running job and save its answer to the chat in one step, so a
-- screen never shows the answer twice (live and saved) or not at all.
-- Returns false when the job is no longer running (already closed by someone
-- else): the caller then saves nothing. p_stale_before closes a job only if
-- its heartbeat is older than that (a run that was cut off).
-- ---------------------------------------------------------------------------
create or replace function public.ai_finish_job(
  p_id uuid,
  p_status text,
  p_blocks jsonb,
  p_text text default null,
  p_steps jsonb default null,
  p_outcome text default null,
  p_summary text default null,
  p_error text default null,
  p_stats jsonb default null,
  p_model text default null,
  p_stale_before timestamptz default null
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  j public.ai_jobs;
begin
  if p_status not in ('done', 'failed', 'canceled') then
    raise exception 'ai_finish_job: bad status %', p_status;
  end if;

  update public.ai_jobs
     set status = p_status,
         finished_at = now(),
         status_text = null,
         blocks = coalesce(p_blocks, blocks),
         steps = coalesce(p_steps, steps),
         outcome = coalesce(p_outcome, outcome),
         summary = coalesce(p_summary, summary),
         error = p_error,
         stats = coalesce(p_stats, stats),
         model = coalesce(p_model, model)
   where id = p_id
     and status = 'running'
     and (p_stale_before is null or coalesce(heartbeat_at, started_at, created_at) < p_stale_before)
  returning * into j;
  if not found then
    return false;
  end if;

  if j.chat_id is not null and p_blocks is not null and jsonb_typeof(p_blocks) = 'array' and jsonb_array_length(p_blocks) > 0 then
    insert into public.ai_messages (chat_id, role, blocks, text)
    values (j.chat_id, 'assistant', p_blocks, p_text);
    update public.ai_chats set updated_at = now() where id = j.chat_id;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hand the next job to a fresh server run. The app cannot reliably call
-- itself job after job (the host stops a function that keeps calling itself),
-- so the database makes the call: POST <origin>/api/ai/jobs/work with the
-- worker token the app passed in. Nothing is stored here. Returns the HTTP
-- status, or null when the call could not be made (the app then checks
-- whether the next job started and tries again).
--
-- Never available to the assistant's read-only SQL (ai_read_query).
-- ---------------------------------------------------------------------------
create or replace function public.ai_kick_worker(p_origin text, p_token text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  res_status integer;
begin
  if coalesce(current_setting('transaction_read_only', true), 'off') = 'on' then
    raise exception 'ai_kick_worker is not available in read-only queries';
  end if;
  if p_origin is null
     or (p_origin !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{2,5})?$'
         and p_origin !~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{2,5})?$') then
    raise exception 'ai_kick_worker: bad origin';
  end if;

  begin
    select r.status into res_status
      from extensions.http((
        'POST',
        p_origin || '/api/ai/jobs/work',
        array[extensions.http_header('x-strow-worker', coalesce(p_token, ''))],
        'application/json',
        '{"from":"db"}'
      )::extensions.http_request) as r;
  exception when others then
    -- time-out, network, or the http extension is not installed
    return null;
  end;
  return res_status;
end;
$$;

revoke all on function public.ai_claim_job(integer) from public, anon, authenticated;
revoke all on function public.ai_finish_job(uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_kick_worker(text, text) from public, anon, authenticated;
grant execute on function public.ai_claim_job(integer) to service_role;
grant execute on function public.ai_finish_job(uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.ai_kick_worker(text, text) to service_role;

notify pgrst, 'reload schema';
