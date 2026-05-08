# Strow Ops — Decision Log

**Last updated:** 2026-05-08

Each entry: date, decision, rationale, alternatives considered, who decided.

---

### D1 — Product name: "Strow Ops"
- **Date:** 2026-05-08
- **Rationale:** Broadest scope under the Strow brand. Covers billing, ops, and future inventory/POS without renaming.
- **Alternatives:** Strow Books, Strow Ledger, Strow Daily, Strow Counter
- **Decided by:** Owner

### D2 — Migration path: Option C (Hybrid)
- **Date:** 2026-05-08
- **Decision:** Freeze legacy repo on `legacy/sara` branch. Start fresh `strow-ops` repo. Cut DNS over to new deploy at v1 launch.
- **Rationale:** Clean slate without losing legacy reference. Reversible.
- **Alternatives:** A (strip in place — legacy debt), B (full clean break — loses easy reference)
- **Decided by:** Claude (owner delegated)

### D3 — Tech stack: Next.js (App Router) + Tailwind + Supabase
- **Date:** 2026-05-08
- **Decision:** Next.js with App Router, Tailwind CSS, Supabase (Postgres + Storage + Auth as JWT issuer).
- **Rationale:** Owner is already on this stack. App Router is the current standard. No reason to rewrite tooling for a pivot.
- **Alternatives:** Pages Router (older), other frameworks (no benefit)
- **Decided by:** Claude (owner delegated)

### D4 — Auth: PIN-based, owner-managed
- **Date:** 2026-05-08
- **Decision:** Baristas log in via 4-digit numpad PIN. Each barista has their own row in `baristas` table. Owner sets/rotates PINs from the owner dashboard. PINs hashed with bcrypt. Custom auth flow validates PIN server-side and mints a Supabase JWT with `barista_id` and `location_id` claims for RLS.
- **Rationale:** Owner-specified UX (numpad, 4 digits). Per-barista PINs preserve accountability — every audit log entry knows who actually submitted.
- **Open:** "PIN per shift" interpretation — currently treating as "owner can rotate any time," not "PIN auto-rotates per shift." See Q5 in `06-OPEN_QUESTIONS.md`.
- **Decided by:** Owner (UX) + Claude (implementation)

### D5 — Approval flow: AI-flagged items only
- **Date:** 2026-05-08
- **Decision:** High-confidence submissions auto-publish. Only items flagged by AI (low confidence, math doesn't reconcile, anomaly vs history, future date, unknown supplier) wait in the review queue. All publishes are reversible by owner.
- **Rationale:** Avoids owner becoming a daily bottleneck. Trust + verify, not gate-everything.
- **Alternatives:** Every submission gates on owner approval (slow), no review queue (no safety net)
- **Decided by:** Claude (owner delegated)

### D6 — Photo storage: Supabase primary, Google Drive mirror
- **Date:** 2026-05-08
- **Decision:** Photos upload directly to Supabase Storage (transactional — submit blocks until uploaded). Background sync job mirrors to Google Drive at `/Strow/[Location]/[YYYY-MM]/[closings|expenses]/`. Owner UI shows Drive path and "Open in Drive" link once mirror completes.
- **Rationale:** Drive auth or quota issues should never block a barista mid-shift. Drive remains the human-browsable archive.
- **Alternatives:** Drive primary (auth fragility), Drive only (no transactional guarantee)
- **Decided by:** Claude (owner delegated)

### D7 — Inventory: supplier-level for v1
- **Date:** 2026-05-08
- **Decision:** Track expenses at supplier and line-item level. No recipe-level COGS in v1. Schema includes a nullable `inventory_item_id` FK on `expense_line_items` so item-level COGS layers in later without migration.
- **Decided by:** Claude (owner delegated)

### D8 — Multi-location: schema-ready, single-location seeded
- **Date:** 2026-05-08
- **Decision:** All transactional tables include `location_id` FK from day 1. Seed only `qave_main` for v1. Pizza concept and bakery activate later by adding `locations` rows — no schema migration needed.
- **Rationale:** Two hours of planning now vs. major refactor later.
- **Decided by:** Claude (owner delegated)

### D9 — Receipt extraction: bilingual
- **Date:** 2026-05-08
- **Decision:** Claude extraction prompt handles English text, Arabic text, and Arabic numerals (٠-٩). All app UI in English only.
- **Rationale:** UAE supplier invoices are routinely bilingual and use Arabic numerals on some receipts. UI is English-only per owner.
- **Decided by:** Owner (UI language) + Claude (extraction)

### D10 — AI extraction model: Claude Sonnet 4.6
- **Date:** 2026-05-08
- **Decision:** Use `claude-sonnet-4-6` via Anthropic API for OCR + structured extraction. Per-field confidence elicited via JSON schema in prompt (model self-rates each field).
- **Rationale:** Volume is ~3–5 photos/day; cost is trivial regardless. Sonnet handles bilingual + handwritten messy receipts well. Haiku risks accuracy on poor inputs.
- **Alternatives:** Haiku (cheaper but riskier on messy inputs), Opus (overkill at this volume), OCR + LLM hybrid (more moving parts)
- **Decided by:** Claude (owner delegated)

### D11 — PWA with offline submit queue
- **Date:** 2026-05-08
- **Decision:** Phase 1 ships as a responsive web app. Phase 1.5 adds service worker + IndexedDB queue so submissions captured during connection loss replay automatically when wifi returns.
- **Rationale:** Café wifi is unreliable. A barista shouldn't have to re-photograph a receipt because the upload failed.
- **Decided by:** Claude (owner delegated)

### D12 — Twilio: removed in migration
- **Date:** 2026-05-08
- **Decision:** Twilio module and credentials removed entirely during migration. PIN auth needs no SMS verification.
- **Decided by:** Claude (owner delegated)

### D13 — Project memory folder location: `/docs/`
- **Date:** 2026-05-08
- **Rationale:** Most idiomatic location in a Next.js repo. The whole repo is the Strow Ops project, so prefixing with "strow" is redundant.
- **Alternatives:** `/strow-project-memory/`, `/.strow/`, `/project-memory/`
- **Decided by:** Claude (owner delegated)
