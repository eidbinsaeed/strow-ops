-- 0027 — Supplier logos.
-- A supplier's logo is cut from the top of its own bill photo when a bill is
-- scanned (or found later from past bills on the Vendors page), or uploaded by
-- the owner. The image lives in the private Storage bucket `supplier-logos`
-- (created by the app on first use) and is served by /api/supplier-logo/[id].
-- Additive only.

alter table public.suppliers
  add column if not exists logo_path text,
  add column if not exists logo_source text,
  add column if not exists logo_updated_at timestamptz,
  add column if not exists logo_checked_at timestamptz;

do $$
begin
  alter table public.suppliers
    add constraint suppliers_logo_source_check check (logo_source is null or logo_source in ('bill', 'upload'));
exception when duplicate_object then null;
end $$;

comment on column public.suppliers.logo_path is 'Path of the logo image in the private supplier-logos bucket; NULL = no logo yet (the app shows a category icon).';
comment on column public.suppliers.logo_source is 'bill = cut from the supplier''s own bill photo; upload = added by hand on the Vendors page.';
comment on column public.suppliers.logo_updated_at is 'When the logo last changed (also busts the image cache).';
comment on column public.suppliers.logo_checked_at is 'When the past-bills logo finder last looked at this supplier''s bills, so a photo is never paid for twice.';
