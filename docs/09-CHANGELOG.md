# Strow Ops — Changelog

**Last updated:** 2026-05-08

---

## v0.0.3 — 2026-05-08
- Schema v1 (0001) applied to live Supabase project (Singapore region, project ref: dubheyebpmcaqegfmzeb)
- RLS policies (0002) applied — 14 policies across 12 tables, all in public schema
- Fixed: is_owner() helper moved from auth schema (locked by Supabase) to public schema
- Verified live DB has all expected policies via pg_policies query

## v0.0.2 — 2026-05-08
- Phase 0 scaffold: Next.js 15 + Tailwind 4 + Supabase clients
- Supabase migrations 0001 (schema v1) + 0002 (RLS policies v1) written
- D6 revised: Drive primary for photo storage, no Supabase Storage. Saves ~$300/yr Pro plan cost.
- DATA_MODEL.md updated: removed `photo_storage_url` columns

## v0.0.1 — 2026-05-08
- Project memory folder created at `/docs/` with all 11 files seeded.
- Foundational decisions locked (D1–D13 in `03-DECISIONS.md`).
- Repo cloned to `C:\Users\eidbi\Projects\strow-ops` and initial commit pushed.
- No application code yet — Next.js scaffolding next session.
