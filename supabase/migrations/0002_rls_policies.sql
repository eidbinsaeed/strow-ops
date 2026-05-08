-- Strow Ops — RLS Policies v1
-- Phase 0 RLS: owner-side policies only. Baristas come online once PIN auth
-- mints custom JWTs with barista_id and location_id claims (next migration).
-- For Phase 0, baristas use the service role from server-side API routes.

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Returns true if the calling user is an authenticated owner (registered in owners table).
create or replace function auth.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from owners where id = auth.uid()
  );
$$;

comment on function auth.is_owner is 'True when the auth.uid() matches a row in owners. Used as the gate for owner-side RLS.';

-- ============================================================================
-- LOCATIONS
-- ============================================================================
-- Owners: full access. Baristas via service role for now.

create policy "owners_full_access_locations"
  on locations
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- OWNERS
-- ============================================================================

create policy "owners_select_self"
  on owners
  for select
  using (id = auth.uid());

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

create policy "owners_full_access_baristas"
  on baristas
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- CATEGORIES (shared across locations for now)
-- ============================================================================

create policy "owners_full_access_categories"
  on categories
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- Anyone authenticated can SELECT categories (baristas need them via service role
-- for now, but this is forward-compatible with direct barista access in v2).
create policy "any_auth_select_categories"
  on categories
  for select
  using (auth.role() = 'authenticated');

-- ============================================================================
-- SUPPLIERS
-- ============================================================================

create policy "owners_full_access_suppliers"
  on suppliers
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- CLOSINGS
-- ============================================================================

create policy "owners_full_access_closings"
  on closings
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- EXPENSES
-- ============================================================================

create policy "owners_full_access_expenses"
  on expenses
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- EXPENSE LINE ITEMS
-- ============================================================================

create policy "owners_full_access_line_items"
  on expense_line_items
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- FIXED COSTS
-- ============================================================================

create policy "owners_full_access_fixed_costs"
  on fixed_costs
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- LIABILITIES
-- ============================================================================

create policy "owners_full_access_liabilities"
  on liabilities
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
-- Owners can SELECT but never INSERT/UPDATE/DELETE directly.
-- All writes happen server-side via service role.

create policy "owners_select_audit_log"
  on audit_log
  for select
  using (auth.is_owner());

-- ============================================================================
-- INVENTORY ITEMS (Phase 2 stub)
-- ============================================================================

create policy "owners_full_access_inventory"
  on inventory_items
  for all
  using (auth.is_owner())
  with check (auth.is_owner());

-- ============================================================================
-- NOTES FOR FUTURE MIGRATIONS
-- ============================================================================
-- v2 will add:
-- 1. auth.barista_id() helper that reads custom JWT claim
-- 2. auth.barista_location_id() helper that reads custom JWT claim
-- 3. Per-table policies for baristas:
--    - SELECT/INSERT on closings/expenses where location_id matches
--    - No UPDATE on confirmed rows
--    - No DELETE ever
--    - SELECT on suppliers/categories/baristas (read-only) for their location
