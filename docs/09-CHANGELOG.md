# Strow Ops — Changelog

**Last updated:** 2026-10-06

---

## 2026-10-07 — POS report at midnight, closing check when the closing comes later
- The POS now emails the full-day report automatically at about 00:01. The daily import runs at **00:05 Dubai** (was 07:55).
- The first automatic report (for 6 Oct) replaced the partial 6 Oct report imported the day before. One report per day; the newer one wins, so its orders and products replace the old ones and nothing is added twice.
- **Migration 0020** also moves the POS vs closing check into `pos_check_closing(report_id, quiet)`. A new trigger, `trg_closings_pos_recheck`, re-runs it whenever a closing is added or its date, status or totals change.
  - Why: baristas submit the closing around midnight, sometimes a few minutes after the 00:05 import.
  - Fill rules: blank closing fields are still only filled when the totals match.
  - Needs you: one item per gap over AED 1, kept up to date and closed once the gap is gone. Days more than 2 days back are re-checked quietly.
  - Safety: a failing check never blocks saving a closing (it only logs a warning).

## 2026-10-06 — New layout: Sales, Orders, Recipes sales, POS uploads, fixed Profit & loss
- **Navigation, grouped the way the café runs:**
  - Top: Pulse, Needs you, Approvals, ✦ Strow AI.
  - **Sales:** Overview, Orders, Closings, POS reports. **Menu:** Recipes. **Purchases:** Bills, Items, Vendors, Recurring costs.
  - **Team:** Staff, Attendance, Staff records. **Reports:** Profit & loss, Spending by category, VAT, Money owed. **Admin:** Chart of accounts, AI activity, Audit trail, Personal finance.
  - Phone tabs: Pulse · Sales · ✦ Strow AI · Reports · More. Each group has a switcher at the top of its pages (`PageAiBar`).
- **Renamed:** the Sales list → Closings; Pending approval / Review → Approvals; Purchases → Bills; Staff reports → Staff records; Liabilities → Money owed. Insights redirects to Sales › Overview.
- **One period picker** on Sales, Orders and Recipes: Day · Week · Month · Pick dates, with ‹ › (`src/lib/period.ts`, `PeriodBar`).
  - URL: `?p=day|week|month|custom&d=YYYY-MM-DD`, or `&from=&to=` for picked dates. Weeks run Monday to Sunday.
  - Comparisons: a day vs the same day last week; a part week or month vs the same days of the previous one; a whole month vs the whole previous month; picked dates vs the same number of days before.
- **Sales › Overview** (`/owner/sales`, `src/lib/sales.ts`):
  - A day's sales = the barista's closing (any status except rejected, like Pulse). A day with only a POS report counts the POS total and is marked "POS only" until the closing comes in.
  - Sales (vs the previous period), orders, average order, busiest 3 hours (day view) or daily average and best day.
  - Chart by hour (POS orders), by day (up to 31 days), by week (up to 120) or by month. Payment split, top sellers (POS item sales, net), weekday averages (14+ closed days), POS vs closing per day.
- **Sales › Orders** (`/owner/orders`): every POS order with time, items, payment and discount; filter by payment (Card, Talabat, Beanz, Keeta, Cash, Free, Split, Other) and search items. Days before the POS show the closing total. Opens on the latest day with a POS report.
- **Sales › POS reports** (`/owner/pos-reports`): upload old EZI POS daily `.xlsx` files, many at once; the business date is read from each file.
  - `POST /api/pos/import` (owner session; raw file bytes, `x-file-name` header, 5 MB max) parses with `src/lib/pos/parse-report.ts` and calls `pos_import_report`.
  - `parse-report.ts` is the TypeScript twin of `scripts/pos_report.py`: same payload and checksum, verified on the sample report and 42 generated variants (including every rejection path).
  - Reports more than 2 days old import with `quiet: true`, so long-gone days do not create Needs you items.
  - Coverage calendar (POS report / closing only / nothing) for the last 3 months, and the list of imported reports with their closing check.
- **Recipes:** two tabs.
  - **Sales** (default): for the period, items sold, share of sales with a recipe, food cost on covered items, sold without a recipe; per item units, net sales, recipe cost and margin (free units shown); items with no recipe yet link to their recipe; items on the menu that did not sell.
  - **Cost cards**: the recipe list by section in menu order, a "POS" mark on prices read from the POS, "added from the POS, no recipe yet" on new items.
- **Profit & loss** (`/owner/reports`, `src/lib/reports/pnl.ts`) rebuilt:
  - Net sales after VAT → bills before VAT grouped into food and drink, packaging, other (rent and salaries billed shown on their own line) → gross profit → recurring costs → net profit.
  - Recurring costs are prorated by day: part months count only the days with sales, the first month starts at the first closing, quarterly and annual costs are spread per month.
  - Month chips for the last 6 months plus picked dates, food cost from bills next to food cost from recipes × POS sales, a "not counted yet" card (app commissions, utilities, stock without a bill), a 6-month profit chart and CSV export. Monthly P&L redirects here.
  - The VAT report uses the location's VAT rate instead of a fixed 5%.
- **Closings** show the POS total next to the barista's count, with "Matches", the gap, or "report made before the closing". **Pulse** shows "Today so far" from the latest POS report until the closing comes in, and whether the POS matches the last close.
- **Migration `0020_pos_menu_autoadd`** (see the data model):
  - A product in a POS report that matches no menu item is added to the menu: no recipe yet, section guessed from its name, POS price.
  - Menu prices that were not typed by hand follow the newest POS report. A price typed by hand is never overwritten, and older uploads never change a newer price.
  - `quiet` imports skip Needs you items. A menu item without recipe lines no longer counts as costed in the POS views.
  - Existing reports are backfilled when it runs, and it updates the Strow AI note "POS daily reports".
- **Learned:** the Supabase MCP confirm dialog also cancels plain data writes (an `UPDATE`), not only DDL. Anything that writes goes into a migration file for the SQL Editor.

## 2026-10-06 — POS daily reports, imported automatically
- **Migration `0019_pos_reports`** is live. Eid ran it in the Supabase SQL Editor, so it is not in `supabase_migrations` history. After the run, production was checked against the tested build and matches it: functions, views, columns, policies, RLS, trigger and indexes.
  - New tables: `pos_daily_reports`, `pos_product_sales`, `pos_category_sales`, `pos_modifier_sales`, `pos_orders`.
  - New functions: `pos_norm`, `pos_method`, `pos_import_report(jsonb)`. The import function can't be called by `anon` or `authenticated`.
  - New views: `v_pos_product_sales`, `v_pos_ingredient_usage`, `v_pos_daily`.
  - New nullable column: `menu_items.pos_name`.
- **`scripts/pos_report.py`**: EZI POS .xlsx (or the Gmail RAW email) → one `select public.pos_import_report(...)` statement. Python stdlib only. It reconciles the report's totals and adds a checksum (`n`, `s`, `c`, `k`) that the database re-checks.
- **Scheduled task "Strow POS daily import"**:
  - Runs every day at 07:55 Dubai, in the cloud, with automatic approval.
  - Steps: Gmail search (`from:ezi.pos.cloud@gmail.com`, last 14 days, not yet labelled) → parser → Supabase `execute_sql`.
  - Gmail labels: "Strow/POS imported" and "Strow/POS rejected".
  - The task prompt embeds the parser and checks its sha256 (`d5ca52c8…`) before running it.
- **Import rules:** one report per business date. A newer report replaces the stored one; the same or an older one is skipped.
- **POS vs barista closing check:**
  - States: `match`, `mismatch`, `no_closing`, `report_before_closing`.
  - A mismatch over AED 1 creates a "Needs you" item (`ai_actions`): `warn`, or `critical` from AED 50 up.
  - Blank closing fields are filled only when the totals match and the report covers the full day. Existing values are never overwritten.
- **Strow AI** has a memory note ("POS daily reports") that points it at the new tables and views.
- **Report address:** the POS emails the report to a strow.app address that Cloudflare Email Routing forwards to the owner's Gmail. The import matches the POS sender, so any address that reaches that Gmail works.
- **Learned:** Supabase MCP asks for a confirm dialog on schema changes it considers destructive. In the cloud app that dialog cancels itself within about 2 seconds. Such migrations must be run by Eid in the SQL Editor.

## 2026-10-05 — Recipes
- **Migration `0018_recipes`** (applied via MCP) added:
  - Tables: `menu_items`, `recipe_lines`.
  - Unit helpers: `uom_base`, `uom_factor`.
  - Cost views: `v_item_unit_cost`, `v_recipe_line_costs`, `v_menu_item_costs`.
- **Data:** 18 menu items and 61 recipe lines imported from the POS recipe screenshots. Cups and lids were added where the POS recipes leave them out.
- **Code:** the Recipes page (photo OCR, typed text, manual entry) is in the `recipes-page` branch commit.

## v0.0.12 — 2026-05-15 (Session 9)
**Cash modelled as a running position; surfaced on the dashboard.**

- Migration `0004`: `cash_events` table (`count` / `withdrawal` events) + `v_cash_position` view (running cash-on-hand = latest count + cash sales − cash expenses − withdrawals since).
- Opening cash balance seeded at AED 165.50.
- `owner/cash/actions.ts` — `recordCashWithdrawal` + `recordCashCount` server actions (audited).
- `CashControls` dashboard card — cash-on-hand balance + today's in/out, with inline "Take cash out" and "Recount / set balance" (enter 0 to zero out) forms.
- Removed the misleading `over_short`-based "cash discrepancy" alert from the dashboard — the per-shift float model never fit Qave's workflow (D17). The `cash_float_*` / `over_short` columns remain but are superseded.
- 8 new bilingual i18n keys.

## v0.0.11 — 2026-05-15 (Session 9)
**Barista photo-upload fix.**

- New `src/lib/image.ts` — `compressImage()` downscales phone photos to ≤1600px JPEG (~250 KB) before upload, converting iOS HEIC to JPEG along the way.
- `CloseFlow.tsx` + `ExpenseFlow.tsx` compress before posting to the extract API, fixing an immediate upload failure on full-resolution photos (seen as "The string did not match the expected pattern" on iOS Safari). Hardened error handling — non-JSON responses and image-read failures now show plain-language messages.

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

## v0.9.0 — 2026-09-27 — Strow AI
- Built-in assistant (Claude Opus 5.5, falls back to Sonnet 4.6): full-screen chat at /owner/assistant with interactive charts, sortable tables, stat cards, bill photos, follow-up chips, voice input, stop button.
- Every AI change is logged in ai_actions with its before-state: one-tap Undo, Approve or Dismiss.
- Autopilot: nightly sweep (Vercel cron 02:00 Dubai), "Run check now" on the dashboard, and an automatic check of every new bill.
- AI memory (ai_memory) — supplier invoice layouts, price norms, owner preferences.
- Read-only SQL gateway ai_read_query: Strow tables only; other projects and Personal Finance writes are blocked.
- Layout: shared responsive page container, phone bottom tab bar with AI button, page-aware AI question chips, desktop AI panel, phone-friendly filters, motion.

## v0.9.1 — 2026-09-27 — Pulse redesign (approved mockup "Strow Ops redesign")
- New look on every owner page except Personal Finance: navy #0F1C2B on cool grey #E8EAED, blue #2350D0 for AI, amber #B26B00 for missing; Bricolage Grotesque + Instrument Sans.
- Pulse home: last close hero (count-up), month strip (closed bars / missing dashed / today ping; tap for values), Autopilot findings, payment split, average day, cash on hand, month stats.
- Needs you (/owner/needs-you): one finding at a time — bill photo with scan line, "now vs should be", proof list, Apply fix / Undo / Dismiss.
- Phone: floating glass tab bar (Pulse · Books · ✦ AI · Staff · More), Qave Cafe header, Books and Staff section switchers. Desktop: Strow sidebar with badges, ask bar on Pulse.
- Barista close: big title, missing-day chips, breathing Take photo button.

## v0.9.2 — 2026-09-27 — AI reliability
- Replies cut off by the length limit are redone in smaller batches instead of being dropped (the cause of the bare "Done." answers); every chat turn ends with a written answer.
- New status "resolved" (migration 0011) + resolve_item tool: fixed items leave Needs you. "Ask AI" passes the item id, and the item closes automatically once a fix lands.
- Dropped connection on the phone ("Load failed"): the chat keeps the spinner and fetches the finished answer from the server.
- Data: 18 unmatched bill lines linked (15 new items, 17 aliases) — one undoable action.

## v0.9.3 — 2026-09-27 — Delivery apps on the closing
- closings: new talabat_total, keeta_total, beanz_total (migration closings_delivery_app_split); online_total stays their sum, so grand_total, views and reports are unchanged. 26 Sep backfilled from the POS report (128 / 77 / 263).
- Close form: Cash, Card, Talabat, Keeta, Beanz (+ optional other online); the AI reads each POS Payment Methods row and never uses the Transactions count as money. The date chip no longer shows red when the report only says "Today".
- Photo prep: blank/black results are detected and retried (decode-at-size, smaller), otherwise the barista is asked to retake — no more black photos sent to the AI.
- Pulse "How customers pay" shows every channel.

## v0.9.4 — 2026-09-27 — Live updates, chat memory
- Live: barista closings/bills and finished Autopilot runs broadcast on Supabase Realtime ("strow-live", no business data in the payload); open owner screens refresh instantly and show a banner (New closing from EiD · Sat 26 Sep · AED 1,401). Fallback: /api/live check every 20 s and whenever the app returns to the front.
- AI chat reopens the last chat; "+ New" starts a fresh one. History shows readable titles ("Fix: …") and a delete button (the chat's changes stay in AI activity).

## v0.9.5 — 2026-09-27 — Popups on iPhone
- Fix: View bill / Edit / bill items / ID card / AI photo popups opened off-screen on iPhone (only the dark backdrop showed). Entrance animations held a transform (fill-mode both), which Safari treats as the popup's frame. Animations now use fill-mode backwards, and every popup renders through a Portal (#strow-portal) at the top of the page.

## v0.9.6 — 2026-09-27 — Lock-screen notifications
- Web Push (iPhone Home Screen app, iOS 16.4+; desktop browsers too): alerts for every barista closing and bill, and when Autopilot needs the owner. Tap opens the right screen.
- Turn on: card on Pulse, or the "Lock-screen alerts" row in the menu (with "Send a test").
- Keys and subscribed devices live in a private Supabase Storage bucket (strow-system/push/…), generated on first use — no env vars needed. public/sw.js gained push + notificationclick handlers.

## v1.0.0 — 2026-09-27 — Personal Finance, new layout
- /owner/finance rebuilt in the Pulse look (Arabic, RTL): overview that fits one phone screen, month budget, installments, debts, analytics; hide-numbers eye. Same tables, same maths (lib/finance/model — ported line for line), same save actions. The original page stays at /owner/finance/classic.
- Safety: daily full backup of every finance table to private storage (strow-system/finance-backups/<day>/), taken on the first visit and before the first save; always before deleting a person. Loader and backup read in pages, so no row is ever cut off at the 1,000-row API cap (a full-month save could otherwise have dropped lines that didn't load). Saves run in order.
- المساعد المالي (/owner/finance/assistant): its own chat and history. Adds a payment to any section and month ("الشهر هذا دفعت ٤٠٠٠ لتصليح السيارة"), edits/moves/deletes lines, marks installments paid — each change with Undo — and analyses with charts like Strow AI. The café AI, Autopilot and AI activity never see personal finance.

## v1.1.0 — 2026-09-27 — Auto-approve + flagged queue
- Review page: Auto-approve switches for closings and purchase bills (settings in private storage, strow-system/settings/app-<ts>.json, newest wins).
- ON: clean submissions are confirmed; anything suspicious is "flagged" and held. OFF: clean ones wait as pending_review. Flagged = AI anomaly, a field the AI wasn't sure of, bill maths not adding up — or Autopilot's per-bill check opening a finding (bill set to flagged with the reason in ai_anomalies).
- Review cards show why ("Flagged: …" / "AI unsure about: total"); flagged first. Badges and Pulse count everything waiting. Lock-screen alerts say flagged/waiting and open Review.

## v1.0.1 — 2026-09-27 — Closings: app split everywhere
- Edit window (Sales / Review): Cash, Card, Talabat, Keeta, Beanz (+ other online) with a live total; online saved as their sum. Days saved before the split stay unsplit (their online shows as "Other online"), so opening Edit never changes a total.
- Sales and Review cards show the full split.
- A payment method with no row on the POS report = 0 (no orders), not a flag: the AI returns 0/high, and the server doesn't hold a closing for an app with no money when the entered totals add up to the report's total. Refunds, total mismatch, future date, negatives and an unsure cash/card read still flag.

## v1.0.2 — 2026-09-27 — Orders per day
- closings.transactions (orders that day, POS "Total Transactions") + closings.transactions_by_method (orders per payment method, jsonb). 26 Sep backfilled: 36 orders (card 21, beanz 8, talabat 3, keeta 2, cash 2) → avg AED 38.92.
- The AI reads the Transactions column/header from the POS report; the barista confirms "Orders today". Sales/Review cards: "36 orders · avg AED 38.92"; Edit window has Orders; Pulse: orders on the last close, in the day strip, and "Orders this month" / "Average order".

## v1.0.3 — 2026-09-28 — AI cost fix
- Cause of the fast credit burn: every chat step ran on Opus 5.5 and re-sent the whole prompt, tools, history and every earlier data/photo result at full price (a deep question = 0.5–1M input tokens ≈ $2–5).
- Now: prompt caching (tools + system + rolling conversation breakpoint; cached reads 10%), Sonnet 5 by default (Opus 5.5 only in Deep mode), Haiku 4.5 for per-bill Autopilot checks, data results capped 8k chars (was 24k), history 10 messages × 1.8k chars (was 16 × 6k), chat ≤12 steps / 3 photos, Autopilot ≤6/16 steps and 1/4 photos.
- ai_usage table: tokens + estimated USD per request (chat, finance chat, Autopilot, photo reading). AI activity shows today / month / breakdown, Deep-mode switch and a monthly budget ($10/20/40/80, default $20) that pauses Autopilot.

## v1.0.4 — 2026-09-28 — Order counts from past photos
- Sales page card: reads the POS "Transactions" numbers off every past closing photo that has no order count (last 40 days or all), 6 per request, 3 at a time, Sonnet 5, ≈1 cent a photo, logged in AI spend.
- Saved only when the photo's sales total equals the saved closing (±AED 1), method counts add up, and the read is sure; never overwrites an existing count. Handwritten sheets are skipped; unclear ones are listed with the reason, a Photo link and "Use N orders".
- closing_order_scans (migration 0015) records each photo's result so none is paid for twice.

## v1.0.5 — 2026-09-28 — Channel comparison
- Photo reader v2 also reads each row's Total Sales and fills Talabat / Keeta / Beanz for days saved with one lumped "online" number — only when cash, card and the apps all match the saved closing (±AED 1) and the read is sure; never overwrites. Photos read by v1 are re-read once for this; handwritten sheets never.
- Pulse "How customers pay": per channel orders and average order (days with POS counts).

## v1.0.6 — 2026-09-28 — Faster page switching
- Cause: page code ran in Washington (iad1) while the database is in Singapore (ap-southeast-1): every query crossed the Pacific (~0.2 s each) and the phone reached the US first. Functions now run in Singapore (vercel.json regions: sin1), next to the database.
- Loading screens (owner, AI chat): a tap switches instantly to an outline of the page while data loads; also lets Next prefetch the page shell.
- Browser keeps just-visited pages for 30 s (experimental.staleTimes), so tab switching / back is instant.

## v1.0.7 — 2026-09-28 — Orders per method on each day
- Sales/Review cards show each method's order count in brackets, e.g. "Card AED 776.00 (16) - Talabat AED 364.00 (8)". Data: 113 days with per-method counts (9 May–27 Sep), 109 with app sales. The 5 July/Aug days whose POS showed one "Online payment" row were cleared from "Take a look" (no per-app split exists).

## v1.0.8 — 2026-09-28 — "Apps combined" instead of fake zeros
- Until ~22 Sep 2026 the POS printed Talabat, Keeta and Beanz as one "Online payment" line. The photo reader had saved those days as Talabat/Keeta/Beanz = 0; 102 days (9 May–21 Sep) were set back to NULL = combined (data fix), and the reader now leaves such days combined.
- "Online" is shown as "Apps combined" (Pulse legend, Sales/Review cards, Edit window); Pulse lists "Apps combined" with its orders and average next to the real per-app rows. Strow AI treats NULL app amounts as "not split", never zero.

## v1.1.0 — 2026-10-06 — Recipes & live drink costs
- New owner page **Recipes** (`/owner/recipes`, in Books next to Items). Three ways in, one review screen before anything saves:
  - **Photo** of handwritten recipe cards / notebook pages (several recipes per photo, several photos at once) → `/api/recipes/extract` (Sonnet 5 → Sonnet 4.6 fallback, forced tool call, logged to AI spend as `photo-recipe`). Photo kept in Drive under `recipes/`.
  - **Type / paste** recipes in any style, English or Arabic → same reader (`text-recipe`).
  - **Manual** blank recipe.
  - The reader matches ingredients to inventory items, converts café units (shot 9/18 g, pump 10 ml, tbsp/tsp, scoops, counted fruit → g) and marks converted or unclear lines amber; size variants become separate recipes ("Spanish Latte 12oz").
- Live cost per drink from the **latest bill** of each ingredient (before VAT), profit and margin vs menu price ex VAT; ▲/▼ badge when an ingredient's price moved vs the previous bill.
- **Finish the costs** panel: each ingredient blocking a cost, fixed once for every recipe using it — pack size ("1 bucket = 3.2 kg", pre-filled from the item name), weight per piece ("1 banana = 120 g"), g↔ml switch, manual price for items never billed, or link a free-text ingredient to a stock item.
- Strow AI can read recipe costs (new views) and add or edit recipes from chat (`menu_items`, `recipe_lines` in the write policy, with undo). Recipes page AI bar: lowest margins, what to reprice, unpriced ingredients.
- Migration `0018_recipes.sql` (additive): `menu_items`, `recipe_lines`, `uom_base()`, `uom_factor()`, `v_item_unit_cost`, `v_recipe_line_costs`, `v_menu_item_costs`.

