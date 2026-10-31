-- 0030 · Item photos and vendor logos from the web (1 Nov 2026). Additive only.
--
-- Every stock item gets a photo so staff and the owner recognise it at a glance (count lists,
-- Items). Photos come from the web (the product's page on a UAE shop or the brand's site, or the
-- Wikipedia picture for fresh produce and plain ingredients), or are added by hand.
-- Images live in the private Storage bucket `item-photos` (made by the app on first use),
-- served by /api/item-photo/[id]?v=<photo_updated_at>.

alter table public.inventory_items add column if not exists photo_path text;
alter table public.inventory_items add column if not exists photo_source text
  check (photo_source is null or photo_source in ('web', 'bill', 'upload'));
alter table public.inventory_items add column if not exists photo_page text;
alter table public.inventory_items add column if not exists photo_updated_at timestamptz;
alter table public.inventory_items add column if not exists photo_checked_at timestamptz;

comment on column public.inventory_items.photo_path is 'Path of the item photo in the private bucket item-photos. NULL = none yet (the app shows a category icon).';
comment on column public.inventory_items.photo_source is 'web = found on the web (photo_page says where), bill = cut from a bill photo, upload = picked by hand (always wins).';
comment on column public.inventory_items.photo_page is 'The web page a web photo came from.';
comment on column public.inventory_items.photo_checked_at is 'When the web photo finder last looked for this item, so it is not paid for twice.';

-- Vendors: logos from their own website, for the ones whose bills carry none.
alter table public.suppliers add column if not exists logo_page text;
alter table public.suppliers add column if not exists logo_web_checked_at timestamptz;
comment on column public.suppliers.logo_page is 'The web page a logo found on the web came from.';
comment on column public.suppliers.logo_web_checked_at is 'When the web logo finder last looked for this vendor.';

-- Logos can also come from the vendor's own website ('web').
alter table public.suppliers drop constraint if exists suppliers_logo_source_check;
alter table public.suppliers add constraint suppliers_logo_source_check
  check (logo_source is null or logo_source in ('bill', 'upload', 'web'));
