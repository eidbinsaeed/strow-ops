# Strow Ops - Known Issues & Tech Debt

**Last updated:** 2026-05-15 (Session 8)

---

## Open

- **Session 9 cash-feature changes not yet built or type-checked.** `owner/cash/actions.ts`, `CashControls.tsx`, the `owner/page.tsx` edits and the new i18n keys were written in an environment that couldn't reach the repo's toolchain. Owner must run `npm run build` + `npm run type-check` before this is trusted in production. (The Session 8 work and the Session 9 photo-upload fix were both built clean and shipped.)
- **Cash-on-hand balance drifts until a recount.** `v_cash_position` accrues cash sales/expenses/withdrawals against the last `count` event. There is no scheduled reconciliation, so unrecorded cash movement accumulates as invisible error until the owner records a physical recount via the dashboard. A recount cadence / "count the cash" flow is the planned fix.
- **`cash_float_*` / `over_short` and the `missing_float` badge are superseded.** Session 9 replaced the per-shift float model with cash-position tracking (D17). The `closings.cash_float_start/end` columns, the `over_short` generated column, the cash-float inputs in `CloseFlow`, and `missing_float_count` in `v_sidebar_badges` (still rendered as a sidebar + dashboard-alert badge) all now point at a dead concept. Clean up in a dedicated pass.
- **`src/types/database.ts` is still a placeholder** (`Database = Record<string, never>`). The Supabase client is effectively untyped, so every view/table read is manually cast (`as unknown as ...`). Run `npm run db:types` against the linked project to generate real types — would catch a whole class of mistakes the compiler currently can't.
- **Migration-naming mismatch.** Migrations were applied to production via the Supabase MCP with timestamped versions (`20260515...`) but committed to the repo as `0003_dashboard_views_and_cash_float.sql` and `0004_cash_events_and_position.sql`. `supabase migration list` will show divergence. Reconcile before the next migration.
- **No inventory-suggestion approval UI.** v2 extraction writes unmatched-line-item suggestions into `expenses.ai_anomalies.unmatched_inventory`, but there is no owner-facing surface to review them or promote them into `inventory_items` rows. See Q9 / D15.
- **Sidebar badges fetched once per layout mount.** `owner/layout.tsx` reads `v_sidebar_badges` when the owner shell mounts; counts don't refresh as the owner navigates between `/owner/*` pages without a full reload. Acceptable for approximate badge counts; revisit if it feels stale.
- **Legacy repo not yet audited.** Whapi integration code needs to be located in `uae-ai-saas` and ported cleanly to the new `strow-ops` repo when Phase 2 starts.
- **Per-field confidence is heuristic.** Anthropic API doesn't return per-field confidence natively. The model self-rates each field in its JSON output. v2 extraction (Session 8) also returns an `anomalies` object that auto-routes flagged submissions to the review queue — but both the confidence thresholds and the anomaly flags still need calibration against real receipts.
- **Bilingual receipts + Arabic numerals.** OCR prompt instructs explicitly on Arabic numeral interpretation but accuracy is unverified until real samples arrive.
- **Date format inconsistency (DD-MM vs MM-DD).** Normalization happens in the prompt but is unverified.
- **Legacy credentials exposed in chat history.** Owner action: rotate before v1 cutover.
- **No real receipt sample yet.** OCR prompt calibration is blocked on photos of an actual Qave end-of-day close sheet and a supplier invoice. The v2 prompts (line items, inventory matching, anomalies) are written but entirely uncalibrated.
- **Drive sync needs OWNER_DRIVE refresh token.** Run `node scripts/get-drive-refresh-token.mjs` once and set GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_ROOT_FOLDER_ID before Drive sync goes live. Code is in place and gates itself on `isDriveConfigured()` - submissions still succeed with null photo URLs if the env isn't ready.
- **`owners` row not auto-populated.** Owner-side audit entries log `actor_type=owner` with `actor_id=null`. Tolerable until per-owner identity is needed.
- **Service worker is conservative.** Caches only static assets and the manifest. Auth-sensitive routes (/api, /owner, /login, /today) always go to network. Aggressive shell caching can ship later if needed.

## Resolved

- **2026-05-15 (Session 9) - Barista photo-upload failure on real photos.** Full-resolution phone photos exceeded the extract API's request-body limit and bounced before reaching the AI (surfaced as "The string did not match the expected pattern" on iOS Safari, on both close and expense flows). Fixed with client-side compression — new `src/lib/image.ts` downscales to ≤1600px JPEG before upload. Built clean and shipped.
- **2026-05-15 (Session 9) - Misleading "May 14 cash short −298" dashboard alert.** Root cause was the `over_short` formula applied to a workflow it never modelled (D17) — not real missing cash. May 14 had 186 cash sales against 1,889.90 of cash expenses paid from the safe. The `over_short`-based alert was removed; cash is now a running position (`v_cash_position`).
- **2026-05-15 (Session 8) - Session 8 work shipped.** Sidebar badges, dashboard (hero + alerts + 7-day chart), cash-float UI, and v2 AI extraction were built clean (`type-check` + `build` passed), committed, and deployed.
- **2026-05-15 (Session 8) - `OwnerNavContent` badges prop wired up.** Session 7 added the `badges` prop but nothing passed it (rendered as before — "safe but inert"). `owner/layout.tsx` now fetches `v_sidebar_badges` and feeds both the desktop sidebar and the mobile drawer.
- **2026-05-15 (Session 7) - Cash float `0/0` defaults producing nonsense `over_short`.** `closings.cash_float_start/end` were `NOT NULL DEFAULT 0`, so `over_short` computed a meaningless value for every closing that never captured a float. Migration `0003` made the columns nullable, regenerated `over_short` NULL-safe, and nullified 6 historical fake-zero floats. Barista UI to capture real floats landed in Session 8.
- **2026-05-09 (Session 6) - Owner PIN auth, review queue actions, Drive photo sync, PWA shell, offline submit queue.** Phase 1 + Phase 1.5 closed end-to-end.
- **2026-05-09 (Session 6) - Audit log writes wired across all mutations.** Barista submissions and owner CRUD all write to `audit_log` via `writeAudit`. Sensitive fields (PIN) are never logged.
- **2026-05-09 (Session 5) - Schema drift on `closings` and `expenses` insert (commit `c58440a`).** Dropped `photo_storage_url` (never created), `grand_total`, and `over_short` (both GENERATED ALWAYS) from inserts. CloseFlow review now renders grand total as a live-computed read-only display.
