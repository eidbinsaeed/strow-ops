# Strow Ops — Changelog

**Last updated:** 2026-05-09

---

## v0.0.6 — 2026-05-09
- Wired all owner pages with real database CRUD
- Baristas: full CRUD (add, on-shift toggle, PIN rotate, deactivate/reactivate)
- Suppliers: add + delete
- Categories: add + soft-delete + reactivate
- Fixed costs: add + soft-delete (with monthly recurring total)
- Liabilities: record + settle + reopen (with open total)
- Read-only pages with real DB queries: closings, expenses, review queue, audit log
- Smart placeholder for reports listing 6 planned reports
- Pattern: Server Actions + useTransition + revalidatePath throughout

## v0.0.5 — 2026-05-09 (overnight)
- Complete app shell shipped — every route navigates somewhere real
- Owner side: 12 routes with shared sidebar/top-bar layout, active-state highlighting
- Barista `/today` page added
- `/owner` dashboard wired to live DB counts (locations, baristas, on-shift, suppliers, categories)
- `/owner/baristas` initial list view (read-only, replaced by full CRUD in v0.0.6)
- Reusable `PlaceholderPage` component
- Typed routes via `Route` from "next" — type-safe href everywhere

## v0.0.4 — 2026-05-08
- Activated barista home buttons
- Added `/close` and `/expense` placeholder routes

## v0.0.3 — 2026-05-08
- PIN auth wired end-to-end (numpad UI + JWT + middleware)
- Deployed to Vercel at strow-ops.vercel.app
- All env vars provisioned in Vercel
- Phase 0 closed

## v0.0.2 — 2026-05-08
- Schema v1 applied: 12 tables, RLS on all
- Migration `0001_initial_schema.sql` + `0002_rls_policies.sql`
- Fixed RLS: moved `is_owner` helper from `auth` to `public` schema

## v0.0.1 — 2026-05-08
- Project memory folder created at `/docs/` with all 11 files seeded
- Foundational decisions locked (D1–D13 in `03-DECISIONS.md`)
- No code written yet
