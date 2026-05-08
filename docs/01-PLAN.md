# Strow Ops — Phasing Plan

**Last updated:** 2026-05-08
**Current phase:** Phase 0 — Foundations

---

## Phase 0 — Foundations
**Status:** In progress

- [x] Brief delivered and reviewed
- [x] Foundational decisions locked (see `03-DECISIONS.md`)
- [x] Project memory folder seeded
- [ ] New `strow-ops` GitHub repo created *(owner action)*
- [ ] Legacy repo frozen on `legacy/sara` branch *(owner action)*
- [ ] New Supabase project provisioned
- [ ] Anthropic API key provisioned
- [ ] Google Drive OAuth provisioned
- [ ] Schema v1 designed and committed
- [ ] PIN auth wired (custom flow on Supabase)
- [ ] Legacy credentials rotated *(owner action — urgent)*

## Phase 1 — Barista flow alive
**Status:** Not started

- Login: numpad + 4-digit PIN
- Two-button home screen ("End of Day Close" / "Log Expense")
- End of Day Close: photo → AI extract → review → confirm
- Log Expense: photo → AI extract → review → category → confirm
- Today's submissions list
- Photos to Supabase Storage primary, Google Drive mirror

**Done when:** A barista can close the day from the phone in under 30 seconds.

## Phase 1.5 — PWA + offline submit
**Status:** Not started

- Service worker
- IndexedDB submit queue (replays when connection returns)
- Installable on iOS/Android home screen

## Phase 2 — Owner basics, responsive
**Status:** Not started

- Owner login
- Responsive shell (desktop sidebar / mobile bottom-nav)
- Daily Sales table + photo-side-by-side viewer
- Expenses table + photo viewer
- Suppliers + categories CRUD
- "Needs review" queue
- Audit log

**Done when:** Owner can review yesterday's activity from a phone in bed.

## Phase 3 — Operational depth
**Status:** Not started

- Fixed costs (recurring, with frequency + due date)
- Liabilities/IOU tracker
- Staff roster
- Cash float over/short tracking
- Duplicate-invoice detection
- VAT 5% auto-split
- Date-format normalization

## Phase 4 — Reporting + dogfood
**Status:** Not started

- Monthly P&L
- Cross-data search/filter
- Export (format TBD — see `06-OPEN_QUESTIONS.md`)
- Confidence/anomaly tuning from real photos
- Owner uses it as sole system for one full week

## Phase 5+ — Deferred (post-v1)
- WhatsApp staff notifications via Whapi (first thing post-v1)
- Multi-location activation (pizza, bakery)
- Inventory item linkage with COGS
- POS API integration (Foodics)
- Bank reconciliation against settlements
- Staff time tracking / shifts
