-- 0005_items_tracking.sql
-- Item-level purchase tracking.
--   1. Adds inventory_items.kind  (dairy / plant_milk / packaging / service ...)
--   2. Adds item_aliases          (learned raw-text -> canonical item mappings)
-- Non-destructive. The existing expense_line_items.inventory_item_id FK is reused.

-- 1. Item "kind" so the UI can group (dairy vs plant milk, packaging, service)
alter table inventory_items
  add column if not exists kind text not null default 'other';

comment on column inventory_items.kind is
  'Item family for grouping/anomaly logic: dairy, plant_milk, coffee, bakery, base, produce, frozen_fruit, pantry, beverage, packaging, cleaning, service, other.';

-- 2. Learned aliases: every confirmed raw receipt text -> canonical item.
--    Feeds the AI extraction "known inventory" list so future OCR/handwriting
--    variants auto-match, and powers the one-time backfill of historical lines.
create table if not exists item_aliases (
  id                 uuid primary key default uuid_generate_v4(),
  location_id        uuid not null references locations(id) on delete cascade,
  inventory_item_id  uuid not null references inventory_items(id) on delete cascade,
  raw_text           text not null,                 -- description as printed/extracted
  norm               text not null,                 -- normalized key for matching
  created_at         timestamptz not null default now()
);

create unique index if not exists uniq_item_alias_norm
  on item_aliases(location_id, norm);
create index if not exists idx_item_alias_item
  on item_aliases(inventory_item_id);

alter table item_aliases enable row level security;

drop policy if exists "owners_full_access_item_aliases" on item_aliases;
create policy "owners_full_access_item_aliases"
  on item_aliases
  for all
  using (public.is_owner())
  with check (public.is_owner());
