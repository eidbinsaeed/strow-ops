-- Open AI items (proposals / alerts) can now be closed as "resolved" once fixed.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.ai_actions'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%proposed%';
  if c is not null then
    execute format('alter table public.ai_actions drop constraint %I', c);
  end if;
end $$;

alter table public.ai_actions
  add constraint ai_actions_status_check
  check (status in ('proposed', 'applied', 'undone', 'rejected', 'failed', 'info', 'resolved'));
