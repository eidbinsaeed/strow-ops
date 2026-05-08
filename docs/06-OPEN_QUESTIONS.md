# Strow Ops — Open Questions

**Last updated:** 2026-05-08

Format: question, status (waiting / answered / withdrawn), date asked.

---

### Q1 — Cash float handover protocol
- **Asked:** 2026-05-08 · **Status:** Waiting
- When a shift starts, does the barista enter the float they received from the previous shift, or is it set by the owner once and assumed constant? Affects `cash_float_start` defaulting on closings.

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
