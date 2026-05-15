# Strow Ops — Open Questions

**Last updated:** 2026-05-15

Format: question, status (waiting / answered / withdrawn), date asked.

---

### Q1 — Cash float handover protocol
- **Asked:** 2026-05-08 · **Status:** Withdrawn (2026-05-15)
- Originally: when a shift starts, does the barista enter the float they received from the previous shift, or is it set by the owner once?
- **Withdrawn:** the owner explained Qave's real cash workflow (Session 9) — cash accumulates in a safe, cash expenses draw from the day's takings or the safe, and there is no per-shift register float. The whole float-handover question is moot. Cash is now tracked as a running cash-on-hand position instead (see D17). The remaining loose end is purely cleanup — removing the now-superseded `cash_float_*` fields — tracked in `07-KNOWN_ISSUES.md`, not here.

### Q2 — POS receipt sample
- **Asked:** 2026-05-08 · **Status:** Waiting
- Need a photo of one actual Qave end-of-day close sheet (handwritten or printed) so the AI extraction prompt can be calibrated against the real format.

### Q3 — Reports export format
- **Asked:** 2026-05-08 · **Status:** Waiting
- PDF, Excel, both, or on-screen only for v1? Defaulting to on-screen for Phase 4, with PDF export added if requested.

### Q4 — Whapi notification scope (Phase 2)
- **Asked:** 2026-05-08 · **Status:** Waiting
- Which events trigger WhatsApp messages — every closing, every expense, only above a threshold, daily summary only, errors only? Which group ID is the target? Format approved as in brief Section 6?

### Q5 — PIN-per-shift interpretation
- **Asked:** 2026-05-08 · **Status:** Waiting
- Owner said "I assign the code pin for each barista shift." Currently interpreting as "owner can rotate any time, no auto-rotation." Alternative: PIN auto-rotates per shift for security. Confirm.

### Q6 — Photo capture method
- **Asked:** 2026-05-08 · **Status:** Waiting (low priority — defaulting to both)
- Default UX = open camera directly OR also allow upload from gallery? Default plan: both, with camera as primary CTA.

### Q7 — Owner notification of flagged items
- **Asked:** 2026-05-08 · **Status:** Waiting (low priority)
- Should the owner get a real-time alert when something hits the review queue, or only see it on next dashboard visit? Phase 1 default: dashboard only. Phase 2 with Whapi: real-time WhatsApp.

### Q8 — Owner-paid-personally expenses
- **Asked:** 2026-05-08 · **Status:** Waiting
- When you pay for a café expense from personal funds rather than business, do we model it as an "owner reimbursement" liability + matching expense? Affects expense schema slightly.

### Q9 — Inventory-suggestion approval workflow
- **Asked:** 2026-05-15 · **Status:** Waiting
- v2 AI extraction now reads each receipt's line items and, when it can't match one to an existing `inventory_items` row, returns a `suggested_item_name`. Those suggestions currently accumulate in `expenses.ai_anomalies.unmatched_inventory` (see D15). There is **no UI yet** for the owner to review them and promote good ones into real `inventory_items` rows.
- Questions: where should this live — a tab under Purchases, a section in the review queue, or its own "Inventory" page? How often does the owner want to do this (the brief said "weekly")? Should approving a suggestion also back-fill `inventory_item_id` on the line items that suggested it?
