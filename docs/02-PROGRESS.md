# Strow Ops — Progress Log

**Last updated:** 2026-05-15 (Session 9)

---

## Session 1 — 2026-05-08
**Outcome:** Foundational decisions locked. Project memory folder seeded.

**Done:**
- Read full project brief (`strow-rebuild-brief.md`)
- Surfaced 8 clarifying questions and flags to owner
- Owner delegated remaining decisions ("just surprise me")
- Locked 13 foundational decisions (D1–D13 in `03-DECISIONS.md`)
- Locked product name: **Strow Ops**
- Locked memory folder location: `/docs/`
- Created all 11 memory files

## Session 2 — 2026-05-08
**Outcome:** Repo scaffolded. Schema applied. RLS in place.

**Done:**
- Scaffolded Next.js 15 + Tailwind 4 + Supabase clients
- Created new Supabase project (`dubheyebpmcaqegfmzeb` in Singapore region)
- Applied migration `0001_initial_schema.sql` — 12 tables, seed data
- Applied migration `0002_rls_policies.sql` — 14 owner-only policies
- Pushed to GitHub at https://github.com/eidbinsaeed/strow-ops
- Documented decision changes (D6 → Drive primary, no Supabase Storage)

## Session 3 — 2026-05-08
**Outcome:** Auth wired end-to-end. Live deploy. Phase 0 closed.

**Done:**
- Built numpad + JWT helpers + login/logout API + middleware
- Wired full barista PIN auth flow with bcrypt + jose JWT + httpOnly cookies
- Tested: Ahmed PIN `1234` and Maryam PIN `5678` both log in successfully
- Deployed to Vercel at https://strow-ops.vercel.app
- All env vars set in Vercel (Supabase, Anthropic, Drive OAuth basics, JWT secret)
- Vercel project linked to GitHub for auto-deploy from `main`
- Smoke tested live login flow on production URL
- Cookie type fix on `supabase/server.ts`

**Closed:** Phase 0.

## Session 4 — 2026-05-08 / 2026-05-09 (overnight marathon)
**Outcome:** Full app shell shipped. All owner pages with real CRUD wired to live DB.

**Done:**
- Activated barista home buttons + created `/close`, `/expense`, `/today` placeholders
- Built complete owner shell: 12 routes under `/owner/**`
- Owner layout: responsive sidebar (md+) / top bar (mobile) with active-state nav highlighting
- `OwnerNavLink` client component using typed `Route` from "next"
- `PlaceholderPage` reusable component for WIP routes
- Wired `/owner` dashboard to **live database counts** (locations, baristas, on-shift now, suppliers, categories)
- Wired `/owner/baristas` to **live database** with full CRUD:
  - Add barista (name + role + 4-digit PIN, bcrypt hashed)
  - Toggle on-shift (one-click)
  - Rotate PIN (prompts for new PIN, re-hashes)
  - Deactivate / Reactivate (soft delete)
- Wired `/owner/suppliers` with add (name+TRN+category+contact+notes) + delete
- Wired `/owner/categories` with add (name+optional parent) + soft deactivate/reactivate
- Wired `/owner/fixed-costs` with add (name+kind+amount+frequency+due_day+optional barista link) + soft deactivate. Shows monthly recurring total.
- Wired `/owner/liabilities` with record + mark settled + reopen. Shows open total.
- Wired `/owner/closings` (read-only paginated table, empty until close flow ships)
- Wired `/owner/expenses` (read-only paginated table, empty until expense flow ships)
- Wired `/owner/review` (combined queue across closings+expenses with status filter)
- Wired `/owner/audit` (last 200 audit_log entries with color-coded actions)
- Smart placeholder for `/owner/reports` listing the 6 planned reports

**Pattern established for all CRUD pages:**
- Server component fetches with `createServiceClient()` (RLS-bypass — owner shell trusted)
- Add forms as client components using `useTransition` for optimistic UX
- Per-row actions as client components calling Server Actions directly
- All mutations call `revalidatePath()` for instant page refresh
- Inline error display, no full navigation
- `window.confirm()` on destructive actions

**Skipped / deferred:**
- Owner Supabase Auth gate — `/owner/**` is currently publicly accessible. Risk acceptable on the obscure vercel.app URL for now.
- Edit-name and edit-other-fields for non-baristas (delete + re-add for now)
- Audit log writes — wires up when submission flows ship next session
- Real Anthropic OCR + photo capture — Phase 1 work for next session
- Supabase Storage / Drive sync — needs the close/expense flow first

**Then — same session, kept going. The killer feature is real:**

Both barista flows now ship with Claude OCR end-to-end.

- **Close-of-day flow** (`/close`):
  - 3-stage UI: capture → processing → review
  - Photo capture via camera on mobile, gallery on desktop
  - POST to `/api/close/extract` → Claude Sonnet 4.6 with bilingual extraction prompt
  - Returns: closing_date, cash_total, card_total, online_total, grand_total, cash_float_start/end, notes + per-field confidence
  - Review form pre-filled with extracted values, color-coded by confidence (green=high, amber=medium, red=low)
  - `submitClosing` server action: validates, computes over_short, derives status (confirmed only if reconciles within 0.02 AED + all key fields high confidence; else pending_review)
  - Redirects to `/today?submitted=closing` on success

- **Expense flow** (`/expense`):
  - Same 3-stage pattern, different OCR prompt
  - Extracts: supplier_name, expense_date, invoice_number, subtotal, vat_amount, total, payment_method, category_hint
  - Smart supplier picker: auto-detects whether OCR-extracted supplier matches existing → defaults to "Existing" mode (dropdown) or "New" mode (text input)
  - "New supplier" mode auto-creates the supplier record on submit (with note "Auto-created from expense submission")
  - Category dropdown pre-selects AI-suggested category if it matches one of the 11 seeded categories
  - Payment method as 4 radio buttons (cash/card/bank_transfer/credit), pre-selected from OCR
  - VAT handling: only computes if both subtotal+total visible (many UAE small suppliers don't charge VAT)

- **`/today` page** (was placeholder, now real):
  - Shows current barista's submissions for current UAE-local day
  - Joins closings + expenses, color-coded status badges
  - Success banner if `?submitted=closing` or `?submitted=expense` query param
  - Empty state with CTAs to /close and /expense
  - Uses Asia/Dubai timezone for "today" calculation (not UTC)

- **Anthropic SDK** added to dependencies (`@anthropic-ai/sdk`)
- **Photo storage**: deferred per pragmatic call — photo lives in browser memory only during OCR, then discarded. Drive sync ships next session. `photo_storage_url`/`photo_drive_url`/`photo_drive_path` all stored as null on the closing/expense row.

**Owner action items:**
1. **Rotate compromised credentials** — partial Anthropic API key + Google Drive client secret leaked in chat earlier. Legacy Whapi/Twilio creds also need rotation per original brief.
2. Send a real Qave end-of-day close sheet photo + a real supplier invoice photo so the OCR prompts can be calibrated against actual UAE formats (Q2)
3. Test the full barista loop: login as Ahmed (PIN 1234), tap "End of Day Close", snap any close-sheet-like image, watch the AI fill it in, confirm. Then tap "Log Expense" and do the same with a receipt photo.
4. Decide on owner auth approach: Supabase Auth magic link vs email/password

**Next session goals:**
1. Owner Supabase Auth (proper gating of `/owner/**`)
2. Photo storage via Google Drive sync (needs Drive OAuth refresh token provisioned)
3. Audit log writes from all mutations
4. Calibrate OCR prompts against real Qave receipt photos
5. PWA shell + offline submit queue (Phase 1.5)

## Session 5 — 2026-05-09
**Outcome:** First real-world test exposed schema drift between the codebase and the live Supabase DB. Closing & expense submissions now actually work end-to-end.

**Done:**
- First end-to-end test of the close flow against live data. Submission failed → diagnosed three schema mismatches:
  - `photo_storage_url` was in the insert payload but was never created on either table (D6 pivoted to Drive-only and the column was dropped from the migration).
  - `grand_total` is a `GENERATED ALWAYS` column on `closings` — Postgres computes it from `cash_total + card_total + online_total` and rejects any write to it.
  - `over_short` is also `GENERATED ALWAYS` on `closings`. Same rejection.
- Removed all three from the close insert. Removed `photo_storage_url` from the expense insert.
- Reworked `CloseFlow` review screen so the UX matches DB reality:
  - Cash, card, and online stay as edit-able inputs with confidence colors.
  - Grand total is now a live-computed read-only display block (`cash + card + online`) — single source of truth, updates as the barista types.
  - If the AI's extracted `grand_total` from the receipt disagrees with the live sum by more than 0.02 AED, an amber hint surfaces ("AI read grand total as X, breakdown adds up to Y, double-check one of the sub-totals"). This catches a wrong sub-total without forcing a separate verify field.
- Cleaned stale "ships next session" amber banners off `/owner/closings` and `/owner/expenses` — both flows shipped in Session 4.
- Documented the fix in `07-KNOWN_ISSUES.md` under Resolved.

**Commits:** `c58440a` (schema fix + grand-total UX).

**Skipped / deferred:**
- Audit log writes (still not wired — moved up the queue for Session 6).
- Drive photo sync (still not wired).
- Owner Supabase Auth gate (still open).

**Owner action items (still open from Session 4):**
1. Rotate compromised credentials (Anthropic + Google Drive client secret + legacy Whapi/Twilio).
2. Send a real Qave end-of-day close sheet photo + a real supplier invoice photo to calibrate OCR prompts (Q2).
3. Decide on owner auth approach: Supabase Auth magic link vs email/password.

**Next session goals (carried over + refined):**
1. Owner Supabase Auth (proper gating of `/owner/**`).
2. Audit log writes from close, expense, and all owner CRUD mutations.
3. Photo storage via Google Drive sync (needs Drive OAuth refresh token).
4. Calibrate OCR prompts against real Qave receipt photos once samples arrive.
5. PWA shell + offline submit queue (Phase 1.5).
(Phase 1.5)

## Session 5 — 2026-05-09
**Outcome:** First real-world test exposed schema drift between the codebase and the live Supabase DB. Closing & expense submissions now actually work end-to-end.

**Done:**
- First end-to-end test of the close flow against live data. Submission failed → diagnosed three schema mismatches:
  - `photo_storage_url` was in the insert payload but was never created on either table (D6 pivoted to Drive-only and the column was dropped from the migration).
  - `grand_total` is a `GENERATED ALWAYS` column on `closings` — Postgres computes it from `cash_total + card_total + online_total` and rejects any write to it.
  - `over_short` is also `GENERATED ALWAYS` on `closings`. Same rejection.
- Removed all three from the close insert. Removed `photo_storage_url` from the expense insert.
- Reworked `CloseFlow` review screen so the UX matches DB reality:
  - Cash, card, and online stay as edit-able inputs with confidence colors.
  - Grand total is now a live-computed read-only display block (`cash + card + online`) — single source of truth, updates as the barista types.
  - If the AI's extracted `grand_total` from the receipt disagrees with the live sum by more than 0.02 AED, an amber hint surfaces ("AI read grand total as X, breakdown adds up to Y, double-check one of the sub-totals"). This catches a wrong sub-total without forcing a separate verify field.
- Cleaned stale "ships next session" amber banners off `/owner/closings` and `/owner/expenses` — both flows shipped in Session 4.
- Documented the fix in `07-KNOWN_ISSUES.md` under Resolved.

**Commits:** `c58440a` (schema fix + grand-total UX), plus a follow-up cleanup commit for the stale banners and docs.

**Skipped / deferred:**
- Audit log writes (still not wired — moved up the queue for Session 6).
- Drive photo sync (still not wired).
- Owner Supabase Auth gate (still open).

**Owner action items (still open from Session 4):**
1. Rotate compromised credentials (Anthropic + Google Drive client secret + legacy Whapi/Twilio).
2. Send a real Qave end-of-day close sheet photo + a real supplier invoice photo to calibrate OCR prompts (Q2).
3. Decide on owner auth approach: Supabase Auth magic link vs email/password.

**Next session goals (carried over + refined):**
1. Owner Supabase Auth (proper gating of `/owner/**`).
2. Audit log writes from close, expense, and all owner CRUD mutations.
3. Photo storage via Google Drive sync (needs Drive OAuth refresh token).
4. Calibrate OCR prompts against real Qave receipt photos once samples arrive.
5. PWA shell + offline submit queue (Phase 1.5).

## Session 6 — 2026-05-09
**Outcome:** Audit trail and owner authentication both shipped. The two highest-priority remaining gaps from Session 5 are closed.

**Done:**

**Audit log (`src/lib/audit/log.ts`):**
- Generic helper `writeAudit({ actor_id, actor_type, action, entity_type, entity_id, before_state?, after_state? })` that writes to `audit_log` and never throws — audit failure must never block a successful business write.
- Wired into every mutation:
  - Barista close submission (`submitted_confirmed` or `submitted_pending`).
  - Barista expense submission, plus a separate `auto_created` entry on `supplier` when a brand-new supplier is created from the expense flow.
  - Owner CRUD on baristas (created, deactivated, reactivated, pin_rotated, shift_started, shift_ended), suppliers (created, deleted with `before_state` snapshot), categories (created, deactivated, reactivated), fixed_costs (created, deactivated, reactivated), liabilities (created, settled, reopened).
- Sensitive details — like the actual PIN — are never logged. PIN rotation logs `pin_rotated` with no payload.

**Owner authentication (Supabase magic link + email allowlist):**
- N
## Session 6 (continued) - 2026-05-09
**Outcome:** Phase 1 closed end-to-end. Owner auth swapped to PIN (no email), review queue is fully editable, Drive photo sync, PWA shell, and offline submit queue all shipped.

**Done:**

**Owner auth - replaced magic link with PIN.**
- Dropped Supabase Auth + magic-link entirely. Owner now signs in with a PIN at /owner/login using the same numpad UI baristas already use.
- New env var: OWNER_PIN (4-8 digits). If unset, no one can sign in.
- Custom JWT cookie (separate from barista cookie), 12h TTL, signed with SESSION_JWT_SECRET. Constant-time comparison on the PIN.
- Middleware updated to check the new owner JWT cookie. Magic-link callback route, allowlist, and login server action all deleted.

**Review queue - fully actionable.**
- /owner/review now renders cards (closing or expense), each with four buttons:
  - Confirm: status -> confirmed, audit logs "confirmed".
  - Edit: opens a modal dialog with the row's editable fields (closing_date, totals, notes for closings; expense_date, supplier amounts, payment_method, invoice_number, notes for expenses). Saves with audit before/after snapshot.
  - Reject: status -> rejected, with confirm prompt. Audit logs "rejected".
  - Delete: hard-delete the row, audit logs "deleted" with the full row before-state captured first so the audit trail keeps it forever.

**Drive photo sync.**
- src/lib/drive/upload.ts: uploads receipt JPEG to /Strow/<location_slug>/<YYYY-MM>/<closings|expenses>/<id>.jpg via googleapis. Returns Drive file id, displayPath, viewUrl. Idempotent folder creates.
- scripts/get-drive-refresh-token.mjs: one-time CLI helper that walks through OAuth and prints GOOGLE_DRIVE_REFRESH_TOKEN. Run once, paste the token into Vercel + .env.local.
- Photo data URL is now threaded through the close + expense submission flows as hidden form fields. After insert, the action calls uploadReceiptPhoto and patches photo_drive_url + photo_drive_path on the row. Failures don't block the submission - upload is best-effort.
- isDriveConfigured() guards the call: if env vars are missing, the row simply ships with null photo URLs and the rest of the flow is unaffected.

**PWA shell.**
- public/manifest.webmanifest with name, scope, start_url=/today, display=standalone, theme color, three icon sizes (192, 512, maskable-512 - generated as solid-mark PNGs).
- public/sw.js with stale-while-revalidate cache for static assets, network-only for /api/*, /owner/*, /login, /today (auth-sensitive routes).
- src/components/ServiceWorkerRegistrar.tsx registers the SW in production only.
- Layout now links the manifest, ships the registrar, and includes Apple-touch icon metadata.

**Offline submit queue (Phase 1.5).**
- src/lib/offline/queue.ts: IndexedDB-backed FormData queue. enqueueSubmission, listQueued, deleteQueued, drainQueue.
- /api/queue/replay-closing and /api/queue/replay-expense: thin route handlers that re-enter the existing submitClosing/submitExpense server actions, catching the NEXT_REDIRECT and returning JSON.
- src/components/OfflineQueueRunner.tsx: drains on mount, on `online` event, and on visibility-change. Mounted at the app root in layout.tsx.
- CloseFlow + ExpenseFlow detect navigator.onLine === false at submit time and enqueue instead of POSTing. Redirect to /today?submitted={kind}-queued. /today shows an amber "Saved offline" banner.

**Owner action items (must do for full prod):**
1. Set OWNER_PIN in Vercel env vars.
2. Run `node scripts/get-drive-refresh-token.mjs` locally once, paste the resulting GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_ROOT_FOLDER_ID into Vercel.
3. Vercel will auto-deploy from main. After deploy, set OWNER_EMAILS to blank (no longer used) and remove the Supabase redirect URL if you want.

**Open punch list:**
- Supabase Auth and OWNER_EMAILS are no longer used at runtime. They can stay in env if you want to ressurect magic link later, but the code path is gone.
- OCR prompt calibration still blocked on a real Qave receipt sample.
- `owners` table row not auto-populated (still tolerable - owner audit entries log actor_type=owner with actor_id null).

## Session 7 — 2026-05-15 (web Claude — Supabase MCP + GitHub web editor)
**Outcome:** Database prepped for the owner dashboard. Cash float made nullable + NULL-safe. Four reporting views shipped. Expense data cleaned up. Three app commits landed the receiving-end wiring.

**Done — Database (Supabase production):**
- Migration `0003_dashboard_views_and_cash_float.sql`:
  - `closings.cash_float_start` / `cash_float_end` are now nullable (were `NOT NULL DEFAULT 0`).
  - `closings.over_short` regenerated NULL-safe: returns NULL when either float is missing instead of computing nonsense from default 0s.
  - 6 historical closings had their `0/0` float values nullified (never real captures).
- Four views created: `v_sidebar_badges`, `v_dashboard_kpis` (tz-aware to Asia/Dubai), `v_daily_flow_30d`, `v_expense_breakdown_mtd`.
- Data cleanup: all 8 previously-uncategorized expenses categorized. May 9–14 expenses split Beverage ingredients 6 / For resale 2 / Other 1. The two London Dairy Vanilla purchases split (May 10 resale, May 14 beverage ingredient — arbitrary, easy to flip).
- TRNs backfilled: Spinneys (both branches share `100063694200003`), Alain Pharmacy (`100052069000003`).

**Done — App code (3 commits to `main`, Vercel auto-deployed, local `main` = `2990bf6`):**
- `close/actions.ts`: removed `?? 0` defaulting on cash floats — empty values flow through as NULL.
- `CloseFlow.tsx`: added `cashFloatStart`/`cashFloatEnd` state from AI extraction + two hidden inputs piping them to the form.
- `OwnerNav.tsx`: `OwnerNavContent` accepts an optional `badges` prop; four nav items append `(N)` when the count > 0. Receiving end ready — nothing passed `badges` yet.

**Note:** this session's work was not logged to `/docs/` at the time — Session 8 backfilled this entry.

## Session 8 — 2026-05-15
**Outcome:** Dashboard, sidebar badges, cash-float UI, and v2 AI extraction all wired against the new views/schema. Picked up from local `main` after pulling the 3 web-editor commits (`7123e35..2990bf6`).

**Done:**

**Task 1 — Sidebar badges wired.**
- `owner/layout.tsx` fetches the single `v_sidebar_badges` row via the service client and passes it as `badges` to both `OwnerNavContent` instances (desktop sidebar + the one rendered as `MobileNavDrawer`'s children). `MobileNavDrawer` needed no prop change — it renders `children`. Layout marked `force-dynamic`.

**Task 2 — Owner dashboard.**
- `owner/page.tsx` keeps the recent-activity feed and the existing stat-card sections; adds three sections on top:
  - Hero card — `projected_net` headline + `revenue_mtd` / `variable_expenses_mtd` / `fixed_monthly` / `vat_net_mtd` mini-stats + a trend pill from `trend_vs_avg_pct`.
  - "Needs your eyes" alerts panel — surfaces `v_sidebar_badges` counts and real cash-drawer discrepancies as actionable links to the right page; "all clear" empty state.
  - 7-day daily-revenue bar chart from `v_daily_flow_30d` — lightweight CSS bars (no chart library in deps), weekend bars tinted.
- 23 new bilingual (en/ar) i18n keys added to `dict.ts`.
- Uses **live** view numbers — the brief's snapshot (variable 414.20 / projected net +13,670 / VAT net 379.80) was stale; live `v_dashboard_kpis` is variable 2,146.70 / projected net +5,997.47 / VAT net 297.30. Trend −30.4% and revenue MTD 8,130 matched.

**Task 5 (folded into Task 2) — May 14 cash discrepancy surfaced.**
- The alerts panel queries `closings` for non-null, non-zero `over_short` and lists each as a "cash short/over on [date]" warning row linking to `/owner/closings`. May 14's −298 AED shows there. Not hidden.

**Task 3 — Cash float UI.**
- `CloseFlow.tsx`: removed the two hidden cash-float inputs (web Claude's stopgap), converted the two `Field`s in the "Cash float (optional)" details block to `ControlledField`s wired to the existing `cashFloatStart`/`cashFloatEnd` state. Barista now sees and can correct the AI-extracted floats. Eliminated the duplicate-`name` form fields the stopgap created.

**Task 4 — v2 AI extraction.**
- `api/expense/extract`: v2 prompt extracts `line_items[]` (description / quantity / unit_price / line_total), matches each to known `inventory_items` by similarity (returns `inventory_item_id` when confident, else a `suggested_item_name` + `match_confidence`), keeps per-field confidence, and returns an `anomalies` object. The route now fetches and passes context: active categories, the location's suppliers (with TRNs), inventory items, and a 30-day per-supplier spend summary.
- `api/close/extract`: v2 prompt adds an `anomalies` object (grand-total mismatch, future date, negative value, cash-float discrepancy, unreadable). No line items — close sheets don't have them.
- `ExpenseFlow.tsx` / `CloseFlow.tsx`: carry `line_items` and `ai_anomalies` through as hidden JSON form fields.
- `expense/actions.ts`: parses line items + anomalies; inserts `expense_line_items` rows (best-effort — validates `inventory_item_id` against the location's real inventory so a hallucinated id can't break the FK; a failure here does not undo the expense); stores `ai_anomalies` on the expense merged with `unmatched_inventory` suggestions; a model-detected anomaly routes the expense to `pending_review`.
- `close/actions.ts`: parses + stores `ai_anomalies`; a model-detected anomaly routes the closing to `pending_review`.
- All additive — if v2 returns no line items / no anomalies, both flows behave exactly as before.

**Decisions logged:** D14–D16 (see `03-DECISIONS.md`).

**Not done / pending:**
- **Verification:** these changes are not yet type-checked or built — the working environment couldn't reach the repo's toolchain. Owner runs `npm run build` + `npm run type-check`; any errors come back for a fix pass.
- No UI yet for the owner to review/approve the AI's suggested inventory items — suggestions accumulate in `expenses.ai_anomalies.unmatched_inventory`. See Q9.
- v2 OCR prompts are written but uncalibrated — still blocked on real Qave receipt/close-sheet photos (Q2).

**Owner action items:**
1. Run `npm run build` && `npm run type-check` locally; send back any errors.
2. Commit + push (commands provided in chat).
3. Still open from earlier: rotate compromised credentials; provide real receipt + close-sheet photos for OCR calibration; pull the missing TRNs (Al Rawabi, Crinkle, Golden Grains, Dupak Manufacturing) from physical invoices.

**Next session goals:**
1. Fix anything `npm run build` surfaces.
2. Build the weekly inventory-approval surface — turn `unmatched_inventory` suggestions into real `inventory_items` rows.
3. Calibrate the v2 OCR prompts against real photos.
4. Reconcile the migration-naming mismatch (MCP-applied timestamp versions vs. the repo's `0003_*.sql`).

## Session 9 — 2026-05-15
**Outcome:** Session 8 verified + shipped. Barista photo-upload bug fixed. Cash modelled as a running position and surfaced on the dashboard.

**Done:**

**Session 8 verified + committed.**
- `npm run type-check` + `npm run build` ran clean — compiled, linted, all 18 routes generated. Owner committed + pushed; Vercel deployed.

**Barista photo-upload bug fixed.**
- Real-world test surfaced an immediate error on iPhone Safari ("The string did not match the expected pattern") after taking a photo, on both close and expense flows. Root cause: full-resolution phone photos (4–8 MB) exceed the extract API's request-body limit — the upload bounced before the AI ever saw it. Pre-existing; first surfaced on real use.
- New `src/lib/image.ts` — `compressImage()` downscales to max 1600px and re-encodes as JPEG (~250 KB) via canvas. Also converts iOS HEIC → JPEG and dodges iOS's canvas-size limit.
- `CloseFlow.tsx` + `ExpenseFlow.tsx` now compress before upload, with hardened error handling (image prep wrapped in try/catch; `res.json()` guarded against non-JSON responses; plain-language error messages). `fileToBase64` removed. Device-agnostic — works for iPhone and Android.
- Verified clean build; owner confirmed the flow now reaches the review screen.

**Cash position tracking (D17).**
- Owner explained Qave's real cash workflow — cash accumulates in a safe, cash expenses draw from the day's takings or the safe — which revealed the `cash_float / over_short` model never fit, and that the dashboard's "May 14 −298 cash short" alert was a formula artifact (May 14: 186 cash sales vs. 1,889.90 cash expenses paid from the safe).
- Migration `0004`: `cash_events` table (`count` / `withdrawal` events) + `v_cash_position` view (running balance = latest count + cash sales − cash expenses − withdrawals since). Applied via Supabase MCP and verified — opening balance seeded at AED 165.50, view returns 165.50.
- `src/app/owner/cash/actions.ts` — `recordCashWithdrawal` + `recordCashCount` server actions (audited via `getOwnerActor` + `writeAudit`).
- `src/components/owner/CashControls.tsx` — dashboard card: cash-on-hand balance + today's in/out, with inline "Take cash out" and "Recount / set balance" (enter 0 to zero out) forms.
- `owner/page.tsx` — renders the cash card (below the hero); the misleading `over_short` cash-discrepancy alert was removed. 8 new bilingual i18n keys.
- The `cash_float_*` columns and `over_short` generated column are left in place but **superseded** — flagged in `07-KNOWN_ISSUES.md` for a cleanup pass.

**Not done / pending:**
- The cash + photo-fix changes are not yet build-checked (same toolchain limitation). Owner runs `npm run build` + `type-check` and reports.
- No scheduled cash reconciliation — the balance drifts until the owner records a recount (that's the intended correction path).
- Till-vs-safe split not modelled — v1 tracks one combined number (D17).

**Owner action items:**
1. Run `npm run build` + `npm run type-check`; send back any errors.
2. Commit + push (commands provided in chat).
3. Re-test the dashboard cash card + the take-cash-out / recount actions.

**Next session goals:**
1. Fix anything the build surfaces.
2. A "count the cash" reconciliation flow / cadence so the balance can't silently drift.
3. Clean up the superseded `cash_float_*` / `over_short` columns and the now-misleading `missing_float` sidebar badge.
4. Still pending: inventory-approval surface; v2 OCR calibration; migration-naming reconciliation.
