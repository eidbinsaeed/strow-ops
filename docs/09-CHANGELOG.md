# Strow Ops — Changelog

**Last updated:** 2026-05-15

---

## v0.0.10 — 2026-05-15 (Session 8)
**Dashboard, badges, cash-float UI, and v2 AI extraction wired against the new views.**

- `owner/layout.tsx` reads `v_sidebar_badges` and feeds nav badge counts to the desktop sidebar and mobile drawer.
- `owner/page.tsx` gains a month-to-date hero card (projected net + revenue/variable/fixed/VAT + trend pill from `v_dashboard_kpis`), a "Needs your eyes" alerts panel (badge counts + real cash-drawer discrepancies as actionable links), and a 7-day daily-revenue bar chart from `v_daily_flow_30d`. Existing today's-flows / setup / recent-activity sections retained.
- May 14 cash discrepancy (`over_short = −298`) surfaced on the dashboard alerts panel.
- `CloseFlow.tsx` cash-float inputs converted from hidden inputs to visible, editable `ControlledField`s.
- AI extraction v2: `api/expense/extract` extracts line items, matches them to `inventory_items`, and returns an anomalies object; `api/close/extract` returns an anomalies object. Extract route passes categories/suppliers/inventory/30-day-spend as context.
- `expense/actions.ts` persists `expense_line_items` rows and `ai_anomalies`; `close/actions.ts` persists `ai_anomalies`. A model-detected anomaly auto-routes the submission to `pending_review`.
- 23 new bilingual i18n keys. Decisions D14–D16 logged.

## v0.0.9 — 2026-05-15 (Session 7 — web Claude)
**Database prepped for the owner dashboard.**

- Migration `0003_dashboard_views_and_cash_float.sql`: `closings.cash_float_start/end` made nullable; `over_short` regenerated NULL-safe; 6 historical `0/0` floats nullified.
- Views `v_sidebar_badges`, `v_dashboard_kpis`, `v_daily_flow_30d`, `v_expense_breakdown_mtd` created.
- Expense data cleaned up (all categorized); TRNs backfilled for Spinneys + Alain Pharmacy.
- 3 commits to `main`: cash-float NULL handling in `close/actions.ts`, cash-float state + hidden inputs in `CloseFlow.tsx`, `badges` prop on `OwnerNavContent`.

## v0.0.8 — 2026-05-09 (Sessions 5–6 catch-up — backfilled)
**Phase 1 + Phase 1.5 closed end-to-end.** *(Not logged at the time; reconstructed in Session 8.)*

- Schema-drift fix on close/expense inserts (`c58440a`): dropped `photo_storage_url`, `grand_total`, `over_short` (generated) from inserts; grand total now a live-computed read-only display.
- `audit_log` writes wired across every barista submission and owner CRUD mutation via `writeAudit`.
- Owner auth: replaced Supabase magic-link with a PIN flow (`OWNER_PIN` env, separate JWT cookie).
- Review queue made fully actionable (confirm / edit-modal / reject / delete with audit snapshots).
- Google Drive photo sync (`lib/drive/upload.ts` + one-time refresh-token helper script).
- PWA shell (manifest + service worker + registrar) and offline submit queue (IndexedDB + replay routes).
- Accountant-style owner nav, row actions, view-bill modal, table filters, 3 reports + CSV/PDF export.
- Full Arabic i18n + RTL with browser auto-detect and a language toggle; mobile hamburger drawer.
- Dashboard wired to live today's-flows + recent-activity feed.

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
