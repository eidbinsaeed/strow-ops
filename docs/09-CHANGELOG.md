# Strow Ops — Changelog

**Last updated:** 2026-05-09

---

## v0.0.7 — 2026-05-09
**The product loop is closed end-to-end.**

- Added `@anthropic-ai/sdk` dependency
- POST `/api/close/extract` — Claude Sonnet 4.6 with bilingual OCR prompt for end-of-day close sheets
- POST `/api/expense/extract` — Claude Sonnet 4.6 with bilingual OCR prompt for supplier invoices/receipts (extracts supplier name, invoice #, subtotal/VAT/total, payment method, suggests category)
- `/close` page rewritten as 3-stage flow (capture → processing → review-and-confirm) with confidence-coded form fields
- `/expense` page rewritten as 3-stage flow with smart supplier picker (existing dropdown OR new supplier text input with auto-create on submit) and AI-suggested category
- `submitClosing` server action — derives status from confidence + reconciliation, inserts closing row
- `submitExpense` server action — auto-creates new supplier if needed, derives status, inserts expense row
- `/today` page wired to real DB — shows current barista's submissions for current UAE-local day, with success banner on `?submitted=closing|expense`
- Per D5 enforced: status='confirmed' only when AI is high-confidence on all key fields AND the math reconciles within 0.02 AED; otherwise pending_review
- Photo storage deferred — photo held in browser memory only during OCR, discarded after submit. Drive sync ships next session.

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
