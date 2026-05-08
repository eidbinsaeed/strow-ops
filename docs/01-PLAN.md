# Strow Ops — Phasing Plan

**Last updated:** 2026-05-09
**Current phase:** Phase 0 ✅ · Phase 1 in progress · Phase 2 substantially done

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
**Status:** Auth shipped. Submission flows next.

- [x] Login: numpad + 4-digit PIN
- [x] Two-button home screen ("End of Day Close" / "Log Expense")
- [x] `/today` placeholder for today's submissions
- [ ] End of Day Close: photo → AI extract → review → confirm
- [ ] Log Expense: photo → AI extract → review → category → confirm
- [ ] Today's submissions list (real data)
- [ ] Photos to Google Drive primary

**Done when:** A barista can close the day from the phone in under 30 seconds.

## Phase 1.5 — PWA + offline submit
**Status:** Not started

- Service worker
- IndexedDB submit queue (replays when connection returns)
- Installable on iOS/Android home screen

## Phase 2 — Owner basics, responsive
**Status:** Substantially done. Auth gate remaining.

- [ ] Owner login (Supabase Auth — placeholder UI shipped, real flow next session)
- [x] Responsive shell (desktop sidebar / mobile top bar)
- [x] Dashboard with live DB counts
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
**Status:** Schema in place, UI wired. Some logic remaining.

- [x] Fixed costs (recurring, with frequency + due day)
- [x] Liabilities/IOU tracker
- [x] Staff roster
- [ ] Cash float over/short tracking *(needs close flow)*
- [ ] Duplicate-invoice detection *(needs expense flow + uniqueness check)*
- [ ] VAT 5% auto-split *(in extraction prompt)*
- [ ] Date-format normalization *(in extraction prompt)*

## Phase 4 — Reporting + dogfood
**Status:** Not started

- Monthly P&L
- Cross-data search/filter
- Export (PDF/Excel — format TBD)
- Confidence/anomaly tuning from real photos
- Owner uses it as sole system for one full week

## Phase 5+ — Deferred (post-v1)
- WhatsApp staff notifications via Whapi (first thing post-v1)
- Multi-location activation (pizza, bakery)
- Inventory item linkage with COGS
- POS API integration (Foodics)
- Bank reconciliation against settlements
- Staff time tracking / shifts
