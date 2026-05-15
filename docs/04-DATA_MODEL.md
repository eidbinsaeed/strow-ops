# Strow Ops — Data Model

**Last updated:** 2026-05-15
**Status:** Implemented — 12 tables, RLS on all, 4 reporting views. The schema below reflects production as of migration `0003`. A few Session-1 sketch column names changed during implementation; corrections are noted inline.

Postgres via Supabase. All tables include `created_at` and `updated_at` (auto). All transactional tables include `location_id` FK. RLS enabled on every table.

---

## Core tables

### `locations`
- `id` uuid pk
- `slug` text unique (e.g. `qave_main`, `pizza_concept`, `bakery`)
- `name` text
- `timezone` text default `Asia/Dubai`
- `currency` text default `AED`
- `vat_rate` numeric default `0.05`

### `baristas`
- `id` uuid pk
- `location_id` fk → `locations`
- `name` text
- `pin_hash` text (bcrypt)
- `is_active` boolean
- `is_on_shift` boolean
- `role` text (`barista`, `lead`, etc.)
- `salary` numeric nullable (used to derive a fixed_costs entry if set)

### `owners`
- `id` uuid pk (matches Supabase Auth `user.id`)
- `email` text unique
- `name` text

### `closings`
- `id` uuid pk
- `location_id` fk
- `closing_date` date
- `barista_id` fk
- `cash_total` / `card_total` / `online_total` numeric — `NOT NULL DEFAULT 0`
- `grand_total` numeric — **GENERATED ALWAYS** = `cash_total + card_total + online_total`. Never insert/update.
- `cash_float_start` / `cash_float_end` numeric **nullable** — NULL = barista did not capture a float (migration `0003` dropped the old `NOT NULL DEFAULT 0`).
- `over_short` numeric — **GENERATED ALWAYS**, NULL-safe: NULL when either float is missing, else `(cash_float_end - cash_float_start) - cash_total`. Never insert/update.
- `liabilities_held` numeric — e.g. customer money kept overnight
- `photo_drive_url` text — Drive view URL *(implemented as `photo_drive_url`, not the sketch's `photo_drive_id`)*
- `photo_drive_path` text — human-readable path at upload time (display only)
- `raw_date_string` text — date exactly as printed on the sheet (forward hook; not yet populated)
- `ai_confidence` jsonb — per-field confidence scores from the extraction prompt
- `ai_anomalies` jsonb — v2 extraction anomalies object (`has_anomaly`, `flags[]`, `explanation`); a truthy `has_anomaly` routes the closing to `pending_review`
- `status` enum `submission_status` (`pending_review`, `confirmed`, `flagged`, `rejected`)
- `notes` text
- `pos_external_id` / `bank_settlement_id` / `shift_id` — forward hooks (unused)

### `expenses`
- `id` uuid pk
- `location_id` fk
- `barista_id` fk
- `expense_date` date
- `supplier_id` fk → `suppliers` (nullable)
- `category_id` fk → `categories` (nullable — NULL = uncategorized, counted by `v_sidebar_badges`)
- `invoice_number` text — intended unique per `(supplier_id, invoice_number)` for duplicate detection *(no hard uniqueness constraint yet — v2 extraction flags `duplicate_invoice_suspected` as an anomaly instead)*
- `subtotal` / `vat_amount` / `total` numeric — `NOT NULL DEFAULT 0`
- `payment_method` enum `payment_method` (`cash`, `card`, `bank_transfer`, `credit`)
- `photo_drive_url` text — Drive view URL *(implemented as `photo_drive_url`, not the sketch's `photo_drive_id`)*
- `photo_drive_path` text — human-readable path at upload time
- `raw_date_string` text — date exactly as printed (forward hook; not yet populated)
- `ai_confidence` jsonb
- `ai_anomalies` jsonb — v2 extraction anomalies object, plus an `unmatched_inventory` array of `{description, suggested_item_name}` for line items the AI couldn't match (see D15)
- `status` enum `submission_status`
- `notes` text
- `bank_settlement_id` / `shift_id` — forward hooks (unused)

### `expense_line_items`
- `id` uuid pk
- `expense_id` fk → `expenses`
- `description` text — `NOT NULL`
- `quantity` numeric — `NOT NULL DEFAULT 1`
- `unit_price` numeric — `NOT NULL DEFAULT 0`
- `line_total` numeric — `NOT NULL DEFAULT 0`
- `inventory_item_id` fk → `inventory_items` nullable — set when v2 extraction confidently matches the line; otherwise NULL and a suggestion lands in the parent's `ai_anomalies.unmatched_inventory`
- `position` int — `NOT NULL DEFAULT 0`, line order on the receipt
- `created_at` timestamptz
- **Written by `submitExpense`** (Session 8) — best-effort insert after the parent `expenses` row; a failure here does not undo the expense.

### `suppliers`
- `id` uuid pk
- `location_id` fk
- `name` text
- `trn` text — UAE Tax Registration Number
- `category_id` fk → `categories` (default category for this supplier)
- `contact` text
- `notes` text

### `categories`
- `id` uuid pk
- `name` text — e.g. `Beverage Ingredients`, `Resale/Bakery`, `Packaging`, `Equipment`, `Cleaning`
- `parent_id` fk nullable — for sub-categories
- `is_active` boolean

### `fixed_costs`
- `id` uuid pk
- `location_id` fk
- `name` text — e.g. "Rent — main location", "DEWA", "Salary — Ahmed"
- `kind` enum (`salary`, `rent`, `utility`, `subscription`, `other`)
- `amount` numeric
- `frequency` enum (`monthly`, `quarterly`, `annual`, `one_time`)
- `due_day` int — day of the month
- `is_active` boolean
- `linked_barista_id` fk nullable — for salary entries

### `liabilities`
- `id` uuid pk
- `location_id` fk
- `incurred_date` date
- `counterparty` text — customer name, party we owe, etc.
- `amount` numeric
- `kind` enum (`customer_held`, `iou`, `deferred_payment`)
- `status` enum (`open`, `settled`)
- `settled_date` date nullable
- `notes` text

### `audit_log`
- `id` uuid pk
- `actor_id` uuid — `barista_id` or `owner_id`
- `actor_type` enum (`barista`, `owner`)
- `action` text — `created`, `updated`, `deleted`, `confirmed`, etc.
- `entity_type` text — `closing`, `expense`, `supplier`, etc.
- `entity_id` uuid
- `before` jsonb nullable
- `after` jsonb nullable
- `created_at` timestamptz

### `inventory_items`
Real table, currently **empty** (no rows seeded). Populated later as the owner approves AI line-item suggestions (see Q9 / D15).
- `id` uuid pk
- `location_id` fk → `locations`
- `name` text — `NOT NULL`, canonical item name
- `unit` text nullable — e.g. "1L", "kg", "pack of 8"
- `is_active` boolean — `NOT NULL DEFAULT true`
- `created_at` / `updated_at` timestamptz

### `cash_events` *(migration `0004`, Session 9)*
Manual cash-control events. Cash sales (`closings.cash_total`) and cash expenses (`expenses` where `payment_method='cash'`) are **not** stored here — they are derived. See D17.
- `id` uuid pk
- `location_id` fk → `locations`
- `event_date` date — `NOT NULL DEFAULT current_date`
- `kind` text — `NOT NULL`, `CHECK (kind IN ('count','withdrawal'))`. `count` sets the running-balance baseline (opening balance, physical recount, or "zero out" = a count of 0); `withdrawal` deducts cash taken out of the system (e.g. moved to the bank).
- `amount` numeric — `NOT NULL CHECK (amount >= 0)`. For `count`: the counted total. For `withdrawal`: the amount removed.
- `notes` text
- `created_at` timestamptz
- RLS: `owners_full_access_cash_events` (`is_owner()`). Index on `(location_id, event_date)`.

---

## Database views

Tz-aware to `Asia/Dubai` where dates matter. Read-only, cheap, no params.

**Migration `0003` (Session 7):**

- **`v_sidebar_badges`** — single row: `pending_count`, `uncategorized_count`, `open_liabilities_count`, `missing_float_count`, `missing_trn_count`. Feeds the owner sidebar badges and the dashboard alerts panel.
- **`v_dashboard_kpis`** — one row per active location: revenue / variable / VAT (collected, paid, net) MTD, `fixed_monthly`, `avg_revenue_7d`, `latest_day_revenue`, `trend_vs_avg_pct`, projected revenue / variable / net, `days_closed_mtd`, `days_in_month`, dates. Feeds the dashboard hero.
- **`v_daily_flow_30d`** — one row per day per location, last 30 days: `revenue`, `cash`/`card`/`online`, `expenses`, `is_weekend` (Fri/Sat). Feeds the 7-day flow chart.
- **`v_expense_breakdown_mtd`** — MTD expense splits by supplier and by category, filterable on `breakdown_kind = 'supplier' | 'category'`. Built for a donut + top-vendors list (not yet consumed by the app).

**Migration `0004` (Session 9):**

- **`v_cash_position`** — running cash-on-hand per location. `cash_on_hand` = the most recent `count` event's amount + cash sales − cash expenses − withdrawals, all dated *after* that count. Also returns `anchor_date`, `anchor_amount`, `needs_opening_count`, and today's `cash_in_today` / `cash_out_today` / `cash_withdrawn_today`. Feeds the dashboard "Cash on hand" card.

> Note: views were applied to production via the Supabase MCP (timestamped migration versions) and also committed as `supabase/migrations/0003_*.sql` and `0004_*.sql` — see the migration-naming mismatch in `07-KNOWN_ISSUES.md`.

---

## Forward hooks (intentionally unused in v1)

These columns/tables exist so future features don't require a migration:
- `inventory_item_id` on `expense_line_items` → recipe-level COGS *(now actively written when v2 extraction matches a line)*
- `raw_date_string` on `closings` and `expenses` → preserve the as-printed date for normalization debugging
- `pos_external_id` on `closings` → Foodics/POS integration
- `bank_settlement_id` on `closings` and `expenses` → bank reconciliation
- `shift_id` on `closings` and `expenses` → staff time tracking

---

## RLS policy sketch (to be refined)

- **Baristas** can SELECT/INSERT only rows where `location_id` matches their own AND `barista_id = auth.barista_id()`. No UPDATE on their own past rows after `confirmed` status. No DELETE ever.
- **Owners** can do everything within their owned locations.
- **Service role** (server only) bypasses RLS for system jobs (Drive sync, AI extraction callback).
