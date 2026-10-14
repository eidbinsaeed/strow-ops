-- 0023_recipe_edit_permission.sql — which staff may edit recipes (2026-10-14)
--
-- baristas.can_edit_recipes: the owner switches it on per person (Staff page). Allowed staff get
-- Recipes on the staff app: ingredients, amounts, method, section and new recipes. Prices, on/off
-- menu and deleting stay with the owner. Off for everyone until switched on. Additive, safe to re-run.

alter table public.baristas add column if not exists can_edit_recipes boolean not null default false;
