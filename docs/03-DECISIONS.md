# Strow Ops — Decision Log

**Last updated:** 2026-05-15

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

### D6 — Photo storage: Google Drive only
- **Date:** 2026-05-08 *(revised same day — superseded original "Supabase primary, Drive mirror" decision)*
- **Decision:** Photos go directly to Google Drive at `/Strow/[Location]/[YYYY-MM]/[closings|expenses]/`. No Supabase Storage involvement. Photos are sent to Anthropic API as base64 during extraction (in-memory only), then uploaded to Drive for permanent storage. AI extraction does NOT require photos to be hosted.
- **Rationale:** Drive 15GB free tier covers ~3 years at full multi-location volume. Supabase Storage Pro plan ($25/mo) was solving a non-problem. Drive auth fragility addressed via long-lived OAuth refresh token + Phase 1.5 offline submit queue handles transient upload failures.
- **Schema impact:** `closings` and `expenses` drop `photo_storage_url`. Keep `photo_drive_id` (file ID — stable primary key) and `photo_drive_path` (human-readable display path at upload time). View URL is derivable from ID.
- **Alternatives reconsidered:** Original Supabase-primary plan added cost and complexity for a backup nobody asked for.
- **Decided by:** Owner pushed back on cost, Claude updated plan

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

### D14 — AI anomalies auto-route to the review queue; unmatched inventory items do not
- **Date:** 2026-05-15
- **Decision:** The v2 extraction prompts return an `anomalies` object (`has_anomaly`, `flags[]`, `explanation`) stored in `closings.ai_anomalies` / `expenses.ai_anomalies`. If `has_anomaly` is true, the submission is forced to `pending_review`. Line items the AI could not confidently match to an `inventory_items` row do **not** on their own change the status — they are recorded as suggestions and left for a separate review.
- **Rationale:** Consistent with D5 (gate only what the AI is unsure about). A genuine anomaly — math that doesn't reconcile, a future date, a cash discrepancy — is exactly what the review queue is for. But an unmatched grocery line is normal and routine; routing every such expense to review would defeat D5 and make the owner a bottleneck again.
- **Alternatives:** route everything with unmatched items to review (clogs the queue); ignore anomalies entirely (loses the safety net).
- **Decided by:** Claude (owner delegated — "surprise me" with defensible defaults)

### D15 — Inventory-match suggestions stored in `ai_anomalies.unmatched_inventory`; no approval UI yet
- **Date:** 2026-05-15
- **Decision:** When the AI extracts a line item it can't match to an existing `inventory_items` row, it returns a `suggested_item_name`. Those suggestions are written into the parent expense's `ai_anomalies` jsonb under `unmatched_inventory` (`[{description, suggested_item_name}]`). No migration, no new table. The actual "weekly owner approval" surface — a UI to turn suggestions into real `inventory_items` rows — is **not built this session**; it is scoped as a follow-up (Q9).
- **Rationale:** The brief said "no migration needed," and `expense_line_items` has no column for a suggested name. `ai_anomalies` is the only no-migration home. Building the approval UI well is its own piece of work and shouldn't be rushed into a multi-task session that can't be compile-checked here.
- **Alternatives:** add a `suggested_name` column or a `pending_inventory` table (rejected — migration); force unmatched items into the review queue (rejected — see D14).
- **Decided by:** Claude (owner delegated)

### D16 — Dashboard rebuilt additively; lightweight CSS chart, no chart library
- **Date:** 2026-05-15
- **Decision:** The new dashboard sections (MTD hero, "Needs your eyes" alerts, 7-day flow chart) were **added on top** of `owner/page.tsx`; the existing recent-activity feed and the today's-flows / setup stat-card sections were kept. The 7-day chart is hand-rolled CSS bars — no charting library was added to `package.json`.
- **Rationale:** The brief said "add on top" and explicitly "keep the recent-activity feed." Keeping the existing sections is the lowest-risk change. A chart library is a heavy dependency for one 7-bar sparkline, and the owner reads on a phone — CSS bars render instantly and need no client JS.
- **Alternatives:** replace the today-only stat cards with the MTD hero (more disruptive, not asked for); add Recharts/Chart.js (dependency weight for marginal gain).
- **Decided by:** Claude (owner delegated)
