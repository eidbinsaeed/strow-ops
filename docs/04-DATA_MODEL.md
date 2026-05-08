# Strow Ops — Data Model

**Last updated:** 2026-05-08
**Status:** v0 sketch — not yet implemented

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
- `cash_total` numeric
- `card_total` numeric
- `online_total` numeric
- `grand_total` numeric — computed; reconciliation check
- `cash_float_start` numeric
- `cash_float_end` numeric
- `over_short` numeric — computed
- `liabilities_held` numeric — e.g. customer money kept overnight
- `photo_drive_id` text — Drive file ID (stable primary key for the file)
- `photo_drive_path` text — human-readable path at upload time (display only)
- `ai_confidence` jsonb — per-field scores returned by extraction prompt
- `status` enum (`pending_review`, `confirmed`, `flagged`, `rejected`)
- `notes` text

### `expenses`
- `id` uuid pk
- `location_id` fk
- `barista_id` fk
- `expense_date` date
- `supplier_id` fk → `suppliers`
- `category_id` fk → `categories`
- `invoice_number` text — unique per `(supplier_id, invoice_number)` for duplicate detection
- `subtotal` numeric
- `vat_amount` numeric
- `total` numeric
- `payment_method` enum (`cash`, `card`, `bank_transfer`, `credit`)
- `photo_drive_id` text — Drive file ID
- `photo_drive_path` text — human-readable path at upload time
- `ai_confidence` jsonb
- `status` enum
- `notes` text

### `expense_line_items`
- `id` uuid pk
- `expense_id` fk → `expenses`
- `description` text
- `quantity` numeric
- `unit_price` numeric
- `line_total` numeric
- `inventory_item_id` fk nullable — **forward hook for Phase 2 COGS**

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

### `inventory_items` *(stub — Phase 2)*
Empty placeholder so v1 schema can FK to it without breaking later.

---

## Forward hooks (intentionally unused in v1)

These columns/tables exist so future features don't require a migration:
- `inventory_item_id` on `expense_line_items` → recipe-level COGS
- `pos_external_id` on `closings` → Foodics/POS integration
- `bank_settlement_id` on `closings` and `expenses` → bank reconciliation
- `shift_id` on `closings` and `expenses` → staff time tracking

---

## RLS policy sketch (to be refined)

- **Baristas** can SELECT/INSERT only rows where `location_id` matches their own AND `barista_id = auth.barista_id()`. No UPDATE on their own past rows after `confirmed` status. No DELETE ever.
- **Owners** can do everything within their owned locations.
- **Service role** (server only) bypasses RLS for system jobs (Drive sync, AI extraction callback).
