# Strow Ops — Phasing Plan

**Last updated:** 2026-05-15
**Current phase:** Phases 0–2 ✅ · Phase 1.5 ✅ · Phase 3 mostly done · Phase 4 in progress

---

## Phase 0 — Foundations
**Status:** ✅ Complete

- [x] Brief delivered and reviewed
- [x] Foundational decisions locked (D1–D13 in `03-DECISIONS.md`)
- [x] Project memory folder seeded
- [x] New `strow-ops` GitHub repo created
- [x] Legacy repo frozen on `legacy/sara` branch *(owner pending)*
- [x] New Supabase project provisioned (Singapore, `dubheyebpmcaqegfmzeb`)
- [x] Anthropic API key provisioned (env)
- [x] Google Drive OAuth basics in env
- [x] Schema v1 designed and committed (12 tables, RLS on all)
- [x] PIN auth wired (bcrypt + JWT via jose, httpOnly cookies)
- [x] Live deploy on Vercel at strow-ops.vercel.app
- [ ] Legacy credentials rotated *(owner action — urgent)*

## Phase 1 — Barista flow alive
**Status:** Closing + Expense flows shipped with Claude OCR. PWA + Drive sync remain.

- [x] Login: numpad + 4-digit PIN
- [x] Two-button home screen ("End of Day Close" / "Log Expense")
- [x] `/today` page with real submissions (filtered to current barista, current UAE-local day)
- [x] End of Day Close: photo → AI extract → review → confirm → submit
- [x] Log Expense: photo → AI extract → review → category → confirm → submit
- [x] Today's submissions list (real DB, success banner on submit)
- [x] Photos to Google Drive primary *(Drive sync shipped Session 6; needs `GOOGLE_DRIVE_REFRESH_TOKEN` in env to go live — see 07-KNOWN_ISSUES)*

**Done when:** A barista can close the day from the phone in under 30 seconds. ✅ — pending real-world calibration with an actual Qave close sheet photo.

## Phase 1.5 — PWA + offline submit
**Status:** ✅ Complete (Session 6)

- [x] Service worker (stale-while-revalidate for static assets; network-only for auth-sensitive routes)
- [x] IndexedDB submit queue (replays when connection returns)
- [x] Installable on iOS/Android home screen (manifest + icons)

## Phase 2 — Owner basics, responsive
**Status:** ✅ Complete

- [x] Owner login (PIN-based — `OWNER_PIN` env + separate JWT cookie; the Supabase magic-link approach was dropped)
- [x] Responsive shell (desktop sidebar / mobile top bar + hamburger drawer)
- [x] Dashboard with live DB counts *(Session 8 added the MTD hero, alerts panel, and 7-day flow chart)*
- [x] Daily Sales table (read-only, ready for data)
- [x] Expenses table (read-only, ready for data)
- [x] Suppliers CRUD (add + delete)
- [x] Categories CRUD (add + soft-delete + reactivate)
- [x] Baristas CRUD (add + on-shift toggle + rotate PIN + deactivate/reactivate)
- [x] Fixed Costs CRUD (add + soft-delete)
- [x] Liabilities CRUD (record + settle + reopen)
- [x] "Needs review" queue (combined closings+expenses)
- [x] Audit log viewer (last 200, ready for writes)
- [x] Reports placeholder (real P&L is Phase 4)

**Done when:** Owner can review yesterday's activity from a phone in bed → mostly done. Just needs real auth + real submission data flowing.

## Phase 3 — Operational depth
**Status:** Mostly done. Duplicate-invoice hard check + date normalization remain.

- [x] Fixed costs (recurring, with frequency + due day)
- [x] Liabilities/IOU tracker
- [x] Staff roster
- [x] Cash tracking *(reworked Session 9 — the per-shift float model didn't fit Qave's safe + daily-draw workflow. Replaced with a running cash-on-hand position: `cash_events` table + `v_cash_position` view + dashboard card with take-out / recount controls. See D17. The `cash_float_*` / `over_short` columns are superseded but not yet removed.)*
- [~] Duplicate-invoice detection *(v2 extraction flags `duplicate_invoice_suspected` as an anomaly; no hard `(supplier_id, invoice_number)` uniqueness check yet)*
- [~] VAT 5% auto-split *(handled in the extraction prompt; uncalibrated against real receipts)*
- [~] Date-format normalization *(handled in the extraction prompt; uncalibrated)*

## Phase 4 — Reporting + dogfood
**Status:** In progress

- [x] Monthly P&L (+ category breakdown + VAT reports) — shipped Session 6
- [x] Cross-data search/filter (owner table filters) — shipped Session 6
- [x] Export — CSV + print-to-PDF shipped Session 6 *(Q3 still open on whether Excel is also wanted)*
- [~] Confidence/anomaly tuning from real photos — v2 prompts return per-field confidence + an anomalies object; tuning still blocked on real Qave photos (Q2)
- [ ] Owner uses it as sole system for one full week

## Phase 5+ — Deferred (post-v1)
- WhatsApp staff notifications via Whapi (first thing post-v1)
- Multi-location activation (pizza, bakery)
- Inventory item linkage with COGS
- POS API integration (Foodics)
- Bank reconciliation against settlements
- Staff time tracking / shifts
