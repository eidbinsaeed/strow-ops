-- 0008_autolink_items.sql
-- Auto-link expense line items to inventory items from taught aliases or an
-- exact item-name match, at the database layer. Applied to production
-- 2026-07-10 via the Supabase MCP; committed here to keep the repo in sync.
--
-- Safe by design: the trigger only fills inventory_item_id when it is NULL.
-- It never overwrites an existing match, never deletes, never creates rows.

-- Deterministic normalizer. MUST match the app helper normalizeItemText()
-- (src/lib/inventory-match.ts): lowercase, trim, collapse internal whitespace.
create or replace function public.strow_norm(txt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(txt, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.strow_autolink_line_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  loc uuid;
  matched uuid;
  ndesc text;
begin
  if NEW.inventory_item_id is not null then
    return NEW;
  end if;

  ndesc := public.strow_norm(NEW.description);
  if ndesc = '' then
    return NEW;
  end if;

  select e.location_id into loc from public.expenses e where e.id = NEW.expense_id;
  if loc is null then
    return NEW;
  end if;

  -- 1) owner-taught alias (strongest signal)
  select ia.inventory_item_id into matched
  from public.item_aliases ia
  join public.inventory_items ii on ii.id = ia.inventory_item_id and ii.is_active
  where ia.location_id = loc and ia.norm = ndesc
  limit 1;

  -- 2) exact normalized item-name match
  if matched is null then
    select ii.id into matched
    from public.inventory_items ii
    where ii.location_id = loc and ii.is_active
      and public.strow_norm(ii.name) = ndesc
    limit 1;
  end if;

  if matched is not null then
    NEW.inventory_item_id := matched;
  end if;

  return NEW;
end;
$$;

-- Trigger functions must not be reachable through the public REST API.
revoke execute on function public.strow_autolink_line_item() from anon, authenticated, public;
revoke execute on function public.strow_norm(text) from anon, authenticated, public;

drop trigger if exists trg_autolink_line_item on public.expense_line_items;
create trigger trg_autolink_line_item
before insert on public.expense_line_items
for each row
execute function public.strow_autolink_line_item();
