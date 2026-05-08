-- Strow Ops — RLS Policies v1
-- Phase 0 RLS: owner-side policies only. Baristas come online once PIN auth
-- mints custom JWTs with barista_id and location_id claims (next migration).
-- For Phase 0, baristas use the service role from server-side API routes.
--
-- Note: helper function lives in `public` schema, not `auth`. The `auth`
-- schema in Supabase is owned by supabase_auth_admin and read-only to us.

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Returns true if the calling user is an authenticated owner (registered in owners table).
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owners where id = auth.uid()
  );
$$;

comment on function public.is_owner is
  'True when the auth.uid() matches a row in public.owners. Used as the gate for owner-side RLS.';

-- ============================================================================
-- LOCATIONS
-- ============================================================================

drop policy if exists "owners_full_access_locations" on locations;
create policy "owners_full_access_locations"
  on locations
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- OWNERS
-- ============================================================================

drop policy if exists "owners_select_self" on owners;
create policy "owners_select_self"
  on owners
  for select
  using (id = auth.uid());

drop policy if exists "owners_update_self" on owners;
create policy "owners_update_self"
  on owners
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT into owners is done via a server-side trigger when first owner signs up.
-- No DELETE policy — owner records stay forever.

-- ============================================================================
-- BARISTAS
-- ============================================================================

drop policy if exists "owners_full_access_baristas" on baristas;
create policy "owners_full_access_baristas"
  on baristas
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- CATEGORIES (shared across locations for now)
-- ============================================================================

drop policy if exists "owners_full_access_categories" on categories;
create policy "owners_full_access_categories"
  on categories
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- Anyone authenticated can SELECT categories (baristas need them via service role
-- for now, but this is forward-compatible with direct barista access in v2).
drop policy if exists "any_auth_select_categories" on categories;
create policy "any_auth_select_categories"
  on categories
  for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- SUPPLIERS
-- ============================================================================

drop policy if exists "owners_full_access_suppliers" on suppliers;
create policy "owners_full_access_suppliers"
  on suppliers
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- CLOSINGS
-- ============================================================================

drop policy if exists "owners_full_access_closings" on closings;
create policy "owners_full_access_closings"
  on closings
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- EXPENSES
-- ============================================================================

drop policy if exists "owners_full_access_expenses" on expenses;
create policy "owners_full_access_expenses"
  on expenses
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- EXPENSE LINE ITEMS
-- ============================================================================

drop policy if exists "owners_full_access_line_items" on expense_line_items;
create policy "owners_full_access_line_items"
  on expense_line_items
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- FIXED COSTS
-- ============================================================================

drop policy if exists "owners_full_access_fixed_costs" on fixed_costs;
create policy "owners_full_access_fixed_costs"
  on fixed_costs
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- LIABILITIES
-- ============================================================================

drop policy if exists "owners_full_access_liabilities" on liabilities;
create policy "owners_full_access_liabilities"
  on liabilities
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
-- Owners can SELECT but never INSERT/UPDATE/DELETE directly.
-- All writes happen server-side via service role.

drop policy if exists "owners_select_audit_log" on audit_log;
create policy "owners_select_audit_log"
  on audit_log
  for select
  using (public.is_owner());

-- ============================================================================
-- INVENTORY ITEMS (Phase 2 stub)
-- ============================================================================

drop policy if exists "owners_full_access_inventory" on inventory_items;
create policy "owners_full_access_inventory"
  on inventory_items
  for all
  using (public.is_owner())
  with check (public.is_owner());

-- ============================================================================
-- NOTES FOR FUTURE MIGRATIONS
-- ============================================================================
-- v2 will add:
-- 1. public.barista_id() helper that reads custom JWT claim
-- 2. public.barista_location_id() helper that reads custom JWT claim
-- 3. Per-table policies for baristas:
--    - SELECT/INSERT on closings/expenses where location_id matches
--    - No UPDATE on confirmed rows
--    - No DELETE ever
--    - SELECT on suppliers/categories/baristas (read-only) for their location
