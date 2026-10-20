# Strow Ops — Changelog

**Last updated:** 2026-10-20

---

## 2026-10-20 — Motion with GSAP, supplier logos from bills
- **GSAP** (`gsap` 3.15 + `@gsap/react`), registered once in `src/lib/motion.ts`. Every animation checks Reduce motion first and only moves things that are already in their final place, so a slow script never hides anything. Approved mockups: canvas "Strow · Motion".
  - `components/motion/Reveal`: Pulse comes in piece by piece on first load (hero, Autopilot, each card), once per visit, not on live refreshes. Pulse skips the old CSS rise (`.page.reveal-js`).
  - `components/motion/FlipList`: rows glide to their new places when a list changes (GSAP Flip), new rows fade in. Used on Bills and Closings (filters, search) and on Pulse's Autopilot findings, where new findings from a live refresh slide in at the top. TableFilters now keeps the scroll position (`scroll: false`).
  - **Needs you:** Apply flies the card off to the left, Dismiss to the right, and the next open finding comes in by itself. A toast says what happened, with Undo for 5 s. When nothing is left: a green tick that draws itself, "N handled".
  - **Undo a dismissal:** `decideAction(id, "undo")` on a `rejected` item opens it again (`proposed`, or `info` when it has no fix); undoing an applied fix works as before.
  - **Barista submit:** the Submit button shrinks into a round spinner while sending and opens back up on an error (`components/motion/MorphSubmit`). Today then shows "Close sent" / "Bill sent" with the drawing tick (`components/motion/SuccessTick`).
  - **Live banners** drop in with a small spring and slide up when they leave (after ~7 s, on ×, or when tapped).
  - Count-up numbers and the shimmering text were already there (`CountUpText`, `.ai-shimmer`). Lenis (smooth scroll) was left out: on phones it changes nothing, and it fights the app's own scrolling boxes.
  - Cost: about 45 kB more script on the pages that animate.
- **Supplier logos** (migration `0027_supplier_logos`, applied via MCP, additive): `suppliers.logo_path`, `logo_source` (`bill` | `upload`), `logo_updated_at`, `logo_checked_at`. Images in the private Storage bucket `supplier-logos` (made by the app on first use), served by `/api/supplier-logo/[id]?v=<logo_updated_at>` to signed-in owner or staff.
  - **From each new bill:** the bill reader also returns `supplier_logo_box` (where the supplier's printed logo is, as fractions of the photo; checked by `cleanLogoBox`). The phone cuts the logo out of the photo (`src/lib/logo-crop.ts`, at most 320 px, JPEG on white), shows it next to "Supplier", and sends it with the bill. `submitExpense` saves it after the response only when that supplier has no logo yet. PDFs are skipped.
  - **From past bills:** Vendors › "Logos from past bills": for each supplier with a bill photo and no logo, `/api/suppliers/logo-find` asks Sonnet 5 where the logo is on its latest photo (up to two photos, PDFs skipped; usage logged as `photo-logo`, about 1 cent a vendor); the owner's browser cuts it out and saves it. Each supplier is looked at once (`logo_checked_at`). 41 suppliers today, 31 with a bill photo.
  - **By hand:** Vendors › each supplier: Add logo / Change / Remove (shrunk on the phone first). A hand-picked logo replaces any logo; a logo from a bill never replaces one.
  - **Shown on** Bills and Vendors (`components/owner/SupplierLogo`). No logo yet: a category icon picked from the supplier's name or category, English or Arabic (`src/lib/supplier-icon.ts`: dairy, coffee, desserts, bakery, packaging, delivery apps, supermarkets, food service, fresh produce, pharmacy, cleaning, books, payments; else a shop).
  - Strow AI cannot change the logo columns (write policy `denyColumns`).
- Checked: `tsc`, `next build`; logo box and icon tests; and a headless Chromium run of the motion pieces on a throwaway page with mocked APIs (reveal, Flip on sort and filter, crop to 320×153, submit morph 358 → 52 px, Needs you fix → next card → Undo → fix → dismiss → all clear → Undo reopens → all clear, live banner). No screen was tested against the live data.

## 2026-10-17 — Waste check: what was used vs what sales × recipes say
- **The sum, per item, between two full counts** (a full count = the shop and the store room counted on the same day; the store-room day, Saturday by default):
  - used = start count + bought on bills − end count
  - should use = POS items sold × recipes (`v_pos_ingredient_usage`), cut at the exact count times using the order times in `pos_orders`
  - unexplained = used − should use − what staff logged as thrown away on the shop counts in between
  - all in kg / L / pieces, costed before VAT at what was paid in the period (else the last bill, else the recipe price).
  - Timing rules: the take time is the shop count; bills dated the count day come after a morning count (before 12:00) and before an evening one.
- **Migration `0025_waste_check`** (applied via MCP, additive):
  - `inventory_items.same_as`: "this item is the same thing as that one" for stock (another brand or pack). `v_inventory_groups` maps every item to its group.
  - `v_purchase_lines`: every received bill line in kg / L / pcs. `v_item_unit_cost` now reads its lines from it (checked: same 114 rows, same checksum before and after).
  - `v_stock_takes`, `pos_day_share()`, `stock_waste(from, to)` (one row per item group with a status: ok, not_counted, no_size, unit_mismatch, missing_bills, no_recipe, not_on_list), `stock_waste_period(from, to)` (take times, bill dates, sales in the period, days still missing a POS report).
- **Migration `0026_stock_lists_by_group`**: `stock_ensure_item()` no longer adds a bought item to a list when another item of its group is already there (Oatly would have come back as a second oat-milk line).
- **Owner › Stock › Waste check** (`/owner/stock/waste`, English and Arabic; link on the Stock page):
  - Pick two full counts (latest pair by default). Unexplained loss and logged thrown away in AED and % of sales; what recipes say vs what was really used; how much of the recipe cost the checked items cover.
  - Item by item, biggest gap first, tap for the start count, bills, end count and throw-aways. Amber = more went than recipes explain; blue = less (recipe too big, or a missing bill or count).
  - "Can't check these yet" with the reason, "Used, not in any recipe" (cleaning, supplies), and a Ready check: recipe cost on a count list, count lines with no size, items sold with no bill in 90 days, POS items with no recipe, staff counts switched on, next full count.
- **Staff app:** on the store-room day the shop and store screens say "Full count today" (every item, none left = 0, open pack = 0.5), saving with blanks asks first, and the home buttons say "Full count today · every item".
- **Data fixed for the check** (two actions in AI activity, each can be undone):
  - Groups: all full-cream milk counts as "Milk — Full Cream 2L" (3 L, Al Rawabi gallon, Al Ain UHT, UHT 4-pack, Lacnor case); Oatly and Alpro unsweetened as Alpro oat milk; Kinder and NY cookies as Nutella cookies.
  - Pack sizes: Alpro oat milk 1 L (was 12.5 L: AED 1.12/L instead of 14.00); Al Ain UHT a 4 × 1 L pack (Noon 4 Oct: 4.11/L instead of 16.43); UHT 4-pack 4 L, Lacnor case 12 L, Al Rawabi gallon 3.78 L; frozen strawberry 2.5 kg (was 9.6); cereal 1 kg (was 28); banana pack size removed (was 8 kg).
  - Bill lines: fresh milk 8 Oct 2 × 2 L and 1 × 3 L (were read as 8 and 6 bottles: AED 1.00 and 0.85/L); bananas 7 Oct 1.4 kg, 9 Oct 2 kg (was 16); cereal 9 Oct 1 kg. The AED 470 condensed-milk carton of 3 Oct (car wash) got its line: 48 tins, 17.76 kg.
  - Recipes: Cookies uses Nutella cookies; Kinder Cookies has a recipe (1 cookie); Dirty Espresso's Mactop is linked to a new stock item "Mactop cream 1 L" (manual price kept).
  - Count lists: one line per thing ("Long-life milk 1 L (any brand)", "Oat milk 1 L (Alpro or Oatly)"; the UHT 4-pack, Lacnor and Oatly duplicates are off), "Fresh milk 3 L", sizes on Nutella spread (3 kg buckets, step 0.5), peanut butter and honey jars, cereal, store cups (sleeves of 50), wooden spoons (packs of 100), London Dairy (1 L tubs), Mactop linked on both lists.
- **Strow AI** knows `stock_waste()`, `v_stock_takes`, `same_as` and how to read a positive or negative gap.
- Open: Nutella babka has never had a bill in Strow (63 sold 1–16 Oct, about AED 680 at the recipe price), so the check will show it as a missing delivery until those bills are scanned. The Qavè Signature recipe has 500 g of sugar syrup per drink (cost 0, not stock). Cashew and dates have no size on the lists on purpose: recipes count them one by one (Protein Blueberry: 5 cashews, 2 dates) while bills count a pack or punnet as one piece, which also makes Protein Blueberry show a −67% margin; they need the pack weight and the recipe in grams. Cereal is assumed to be the 1 kg bag.
- Checked: `tsc`, `next build`, waste helper tests, an offline render of the page (English and Arabic) with real-shaped data, and `stock_waste()` run on throwaway counts inside a transaction that was rolled back (nothing was saved).

## 2026-10-14 — Pulse showed −9k: app fees were counted twice
- **Cause:** on 13 Oct Strow AI inserted six confirmed expenses of `doc_type = 'commission_estimate'` ("Delivery Platforms (Talabat/Keeta/Beanz)", May–Oct, AED 16,581) to "book" the app commission — but Strow already takes the fees off every closing at the owner's rates (Pulse, Sales, P&L). The October one (AED 3,073 for 1–12 Oct) was projected to month end (×31/13) on top of the page's own fee projection, so "Projected net after app fees" read −9,258 instead of ≈ −1,900.
- **Fix (data):** the six rows are `rejected` (audit rows written); the Strow AI memory note that led to them now says the opposite, marked as from the owner.
- **Migration `0024_no_app_commission_expenses`** (applied via MCP): trigger `trg_expenses_block_app_commission` refuses any `commission_estimate` expense that is not rejected.
- Prompt: the delivery-app fee rule now says fees are never an expense row; a real app invoice for something else (Talabat advertising) still is.
- Note for reading Pulse: the projection is this month's pace (13 closed days × 31) minus bills at the same pace, minus the 23,000 fixed costs, minus projected app fees. "Spent on N items" is all-time, not this month.

## 2026-10-14 — Recipes: staff can edit them, the owner picks who
- **Migration `0023_recipe_edit_permission`** (applied via MCP): `baristas.can_edit_recipes`, default off.
- **Staff page › "Recipes" switch** per person (next to "Count lists"). Allowed staff get a **Recipes** button on the staff home: the menu by section, "No recipe yet" marked, tap to edit — ingredients (stock item or a free-text name, amount, unit), method, section, and "+ New recipe" (name + section, then the ingredients). No costs, prices or margins are shown to staff; the price, taking an item off the menu and deleting stay with the owner. Every change is in the audit log with the barista as actor; the owner's Recipes page shows the result at once.
- Code: `src/lib/recipe-edit.ts` (the add / change / remove core shared by `owner/recipes/actions.ts` and `(barista)/recipes/actions.ts`); `RecipeEditor` components take `actions` and `mode="staff"`; `/recipes` added to the middleware.
- Also today (data, no code): the Windmill quotation QWL-0100 (24 Jun) and the Stock Roastery proforma (28 Sep) Eid uploaded in the chat were added as bills waiting in Approvals (new supplier Stock Roastery LLC SPC); the six V60 beans (Pina Colada, Bubble Brew, Sweet Melon, Peach, Coconut, Hambela) moved to the shop list under Coffee (kg, min 0.5, usual order 3); "NY cookies" split into Nutella cookies and Kinder cookies (min 3 each).

## 2026-10-14 — Stock: staff order list on WhatsApp, who may edit the lists, every bought item on a list
- **Migration `0022_stock_lists_from_bills`** (applied via MCP, additive): `baristas.can_edit_stock_lists`; `stock_items.source`; `stock_ensure_item()` + trigger `trg_stock_from_line` on `expense_line_items`; backfill. See the data model.
- **Every item on a scanned bill lands on a count list by itself.** The trigger fires when a bill line is linked to an inventory item (staff scan with a confident match, an owner fix in Needs you, Strow AI): fresh and bar items go on the daily shop list, packaging and cleaning on the store-room list, all under "New from bills" with the unit the bill used and no minimum — counted from the next count, ordered only once someone sets a minimum. Backfill put 50 bought items on the lists (27 shop, 23 store); 38 old one-off buys (May–July, bought once) were left off.
- **Staff can send the order list on WhatsApp.** After saving a count, the saved panel shows "Order list ready · N to bring, N to order" with Send on WhatsApp / Copy list. New `/stock/order` page (home button "Order list"): what to bring from the store room and what to order, by supplier, no prices. Same message as the owner's page.
- **Who may edit the count lists.** Staff page › new "Count lists" switch per staff member (`Can edit` / `View only`, off for everyone). Allowed staff get a "Count lists" home button and `/stock/lists`, the same editor as the owner (add, change units / minimum / usual order / supplier / bill-item link, move between shop and store room, remove); every change is in the audit log with the barista as actor. The owner's Count lists page says who is allowed.
- **Count lists editor:** items can now be moved between the shop and store-room lists ("Which list"); a banner counts items from bills that still have no minimum; the owner's Stock page shows the same count under "Count lists & minimums".
- Code: `src/lib/stock-items.ts` (shared add / change / remove with audit), `src/lib/stock-plan.ts` (the order list for the owner page, the staff page and the count action), `src/components/stock/{ListEditor,CopyText,WhatsAppButton}.tsx`.
- Strow AI prompt: knows the trigger and the permission; told not to insert duplicate list items.
- Checked: `tsc`, `next build`.

## 2026-10-14 — Stock: daily shop count, weekly store-room count, order list
- **Migration `0021_stock_counts`** (applied via MCP; written without drops so the MCP runs it): `stock_items`, `stock_counts`, `stock_count_lines`, view `v_stock_levels`. See the data model.
  - Seeded 22 shop items and 22 store-room items, linked to bill/recipe items and usual suppliers where they match.
  - The first store-room count is Shahid's 9 Oct 07:31 list from the team chat (18 items, note says it was imported).
- **Staff app** (`/stock/shop`, `/stock/store`), shown on the home screen only when the owner switches it on (both **off** until then):
  - Shop stock, daily: − / + / type per item, "yesterday N" hint, low items in amber, progress bar, "Thrown away today" (item, amount, expired / spoiled / broken / other) and a note. Saving again the same day updates that day's count.
  - Store room count, weekly (Saturday by default): number per item with last count in grey and "+12 since the last count (delivery?)".
  - The home buttons show "Counted today at 11:18" or "not counted yet today", and "Due since Sat 10 Oct" for the store room.
  - Saving notifies the owner's phone when something is low, thrown away or noted (the store count always).
- **Owner › Purchases › Stock** (`/owner/stock`, English and Arabic):
  - Switches for the two staff screens and the store-count weekday.
  - Order list from the latest counts, grouped by supplier, with an estimate from the last bill prices (before VAT); "Bring from the store room" for shop items the store room has. "Send on WhatsApp" and "Copy list".
  - Days of stock left: shop + store in recipe units ÷ daily use from POS sales × recipes (last 14 days of reports).
  - Thrown away this week (with cost where known), recent counts (tap to see every line), and `/owner/stock/lists` to edit items, units, minimums, usual order, supplier and the bill-item link.
- Logic in `src/lib/stock.ts` (pure, unit-tested: pairing shop and store items, order quantities, supplier groups, days of cover, due dates).
- **Strow AI:** knows the stock tables (prompt), can change `stock_items` (write policy), never the counts. New prompts on the Stock page.
- Checked: `tsc`, `next build`, 8 logic tests, and a full run in a browser against a copy of the data (staff count → save → re-save → store count → owner page, list edits, switch off hides the button, Arabic).
- Not built: the fridge photo from the mockup, and paying suppliers from the app (on hold: staff pay by card at the shop or online).

## 2026-10-14 — Team WhatsApp chat audit: 27 missing bills and the car wash IOU
- The "Qavé Team" WhatsApp export (11 Apr – 14 Oct, 3,330 messages) was read by AI into 1,720 records and checked against Strow. Findings page: artifact "Qavé Team Chat Audit".
- **27 bills added to Approvals** (status `pending_review`, 3,401.25 AED, 9 May – 3 Oct): payments staff posted in the chat with no bill in Strow within 10 days (amount ±1 AED, then ±5%).
  - Each has the poster as barista (Shahid 13, Kayran 13, Danny 1), the chat quote in `notes`, `raw_date_string` = "WhatsApp <timestamp>", and `ai_anomalies.flags` = `from_team_chat`, `no_bill`, so Approvals shows why it is waiting.
  - 24 are `cash` (2,307.25, from the till / float); 3 paid by the car wash are `credit` (1,094: fruit shop Aug tab 260, Amazonas açaí inv. 16201 364, condensed milk 470).
  - One `ai_actions` row (source `chat`, applied, 27 insert ops) so the whole batch can be undone from AI activity; 27 `audit_log` rows `ai_created`.
- **Money owed:** liability "Car wash (makshala)", `iou`, 4,737.24 AED from 3 Aug: 19 loans or supplier payments by the car wash staff (Mr Hamid/Hameed/Hakeem, Mr Kerala, Mr Shaukat) up to 6 Oct, breakdown in `notes`; 3 more (7–9 Oct) had no amount. No repayment appears in the chat. Own `ai_actions` row for undo.
  - Several bills the car wash paid were already in Strow as `cash` (Golden Grains 3 Aug, La Marquise 7 and 25 Aug, Amazonas 28 Sep, Blink and Montone 6 Oct, likely SIDCO 8 Oct); left unchanged.
- Side effect: `v_cash_position` counts pending cash bills, so cash on hand fell by 2,307.25 to −4,287.46. It was already −1,980.21: the only cash count is the 15 May opening balance, so a recount is needed.
- No code or schema change.

## 2026-10-14 — POS import: split payments no longer reject a report
- **Bug:** the 9 Oct report was rejected (upload and the 00:05 email import): "orders per payment method add up to paid orders (47 vs 45)".
  - Cause: two orders were split between two methods (#2142 card 8 + cash 20, #2143 card 1 + cash 38). The POS counts a split order once under each method, so the Payment Method Report says 47 while there were 45 paid orders. The report itself was correct.
- **Fix** (`scripts/pos_report.py` and its twin `src/lib/pos/parse-report.ts`): the method quantities are now checked against the **payment lines in the order list** (47), not the paid orders. "Order list count equals paid orders" still checks the 45.
  - Checked on all 12 reports already stored (1–13 Oct): per method, the order list matches the report on both count and amount, so nothing that imported before is rejected now.
  - Both parsers give the identical payload and checksum for 9 Oct. Variants with a wrong method count or a missing split line are still rejected with the same message in both.
- **9 Oct imported** (quiet, source `upload`): 45 orders, AED 1,973, closing check **match**. #2142 and #2143 are stored with `payment_method = 'mixed'` (the Split filter on Orders).
- **Scheduled task "Strow POS daily import"** updated with the same parser; its embedded copy is now checked against sha256 `d591258a…` (was `d5ca52c8…`). Nothing else in its prompt changed.
- The 9 Oct closing has `transactions = 47` (the POS's per-method count); the true order count is 45.
- No database change.

## 2026-10-12 — Delivery-app fees: what the café keeps from Talabat, Keeta and Beanz
- **Rates (set by the owner):** Talabat **35.8%**, Keeta **30%**, Beanz **30%** of each day's app sales; days before ~22 Sep (apps combined, NULL split) **33%**, the blend by the app mix since the split started (32.98%).
  - Talabat's 35.8% comes from invoice 15622709 (3–5 Oct 2026, 26 orders): commission 360.11 (33.3%) + payment fees 27.37 (2.5%) on gross sales 1,081.29. Talabat calls it "30%".
  - Promotions / marketing the owner runs on the apps are **not** counted (his choice). No invoices are entered: Strow does the maths from the closing (or the POS report until the closing comes in).
  - Rates live in `src/lib/app-fees.ts` (`APP_FEE_SCHEDULE`): to change one, add a row with the day it starts; older days keep their rate.
- **Closings and Approvals:** each card shows "Apps 781 → fees −263 → you keep 518 (Talabat −175 · Keeta −45 · Beanz −43)" (`AppFeeLine`).
- **Sales › Overview:** "After app fees" under How customers paid — app sales − fees = what you keep, per app with its rate.
- **Pulse:** the same apps / fees / you keep block for the month; "Projected net" is now "Projected net after app fees" (the view's projection minus month-to-date fees on confirmed closings, projected at the same pace).
- **Profit & loss:** new line **Delivery app fees** before gross profit (gross = net sales − bills − app fees), so net profit, the 6-month chart and the CSV all include them. "Not counted yet" now lists app promotions instead of app commissions. CSV gets a per-app table (sales, rate, fee, you keep).
- **Strow AI** knows the rates (data rules in `src/lib/ai/prompt.ts`, generated from the same constants) and is told never to assume 30% for Talabat.
- **Checked on production data:** 5 Oct = apps 781, fees 262.66, keep 518.34. September 2026: app sales 14,522 → fees 4,794 (Talabat 856, Keeta 155, Beanz 494, apps combined 3,290) → net profit **−2,165** (was +2,629 before fees). 1–11 Oct: app sales 8,751 → fees 2,883.
- Known gap: for the 3–5 Oct invoice orders the POS recorded 1,327 vs Talabat's 1,138.20 (with VAT), most likely promotion discounts the POS doesn't see, so while promotions run the Talabat fee estimate (475 vs 387 actual) runs a little high and "you keep" a little high too.
- No database change.

## 2026-10-07 — POS report at midnight, closing check when the closing comes later
- The POS now emails the full-day report automatically at about 00:01. The daily import runs at **00:05 Dubai** (was 07:55).
- The first automatic report (for 6 Oct) replaced the partial 6 Oct report imported the day before. One report per day; the newer one wins, so its orders and products replace the old ones and nothing is added twice.
- **Migration 0020** also moves the POS vs closing check into `pos_check_closing(report_id, quiet)`. A new trigger, `trg_closings_pos_recheck`, re-runs it whenever a closing is added or its date, status or totals change.
  - Why: baristas submit the closing around midnight, sometimes a few minutes after the 00:05 import.
  - Fill rules: blank closing fields are still only filled when the totals match.
  - Needs you: one item per gap over AED 1, kept up to date and closed once the gap is gone. Days more than 2 days back are re-checked quietly.
  - Safety: a failing check never blocks saving a closing (it only logs a warning).
- **Prices from the POS, one tap:**
  - A recipe with no price, or a price different from the POS, shows what the POS charged on the latest day it sold, with a "Use AED …" button.
  - Cost cards show "No price · POS AED …" and a "Fill N prices from the POS" button.
  - Both are server actions in `recipes/actions.ts` (`applyPosPrice`, `fillPricesFromPos`, helpers in `src/lib/recipes-pos.ts`). They work before migration 0020 too, saving the price only.
  - Once 0020 is in, a price equal to the POS price follows the POS from then on (`pos_sync_menu` marks it with `price_pos_date`).

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

