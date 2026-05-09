# Strow Ops — Known Issues & Tech Debt

**Last updated:** 2026-05-09

---

## Open

- **Legacy repo not yet audited.** Whapi integration code needs to be located in `uae-ai-saas` and ported cleanly to the new `strow-ops` repo when Phase 2 starts.
- **Per-field confidence is heuristic.** Anthropic API doesn't return per-field confidence natively. Implementation will rely on the model self-rating each field in its JSON output. Calibration needed against real receipts before trusting the green/amber thresholds.
- **Bilingual receipts + Arabic numerals (٠–٩).** Standard OCR libraries often misread these. The extraction prompt must explicitly instruct on Arabic numeral interpretation.
- **Date format inconsistency.** UAE receipts use DD-MM, MM-DD, DD/MM/YY, sometimes mixed within one document. Requires explicit normalization step before storing — and possibly a "raw date string" column preserved alongside the parsed `date` column.
- **Legacy credentials exposed in chat history.** Owner action: rotate before v1 deploy. Tracked in `08-CREDENTIALS_INVENTORY.md`.
- **No real receipt sample yet.** Calibration of the extraction prompt is blocked on a photo of an actual Qave end-of-day close sheet.
- **Desktop Commander stdout quirk on Windows.** External binary stdout doesn't pipe back through PowerShell wrapper; workaround is to redirect to a file and read via `Get-Content`. Affects scripted git/npm/node calls but not Desktop Commander's native `write_file`/`read_file` operations.
- **Owner `/owner/**` routes are publicly accessible.** Risk accepted on the obscure vercel.app URL until owner Supabase Auth gate ships next session.
- **Audit log not yet wired.** Submission flows (close, expense) and owner CRUD don't write to `audit_log` yet. Planned for Session 6.
- **Photo storage not wired.** Photos are sent to Anthropic for extraction in-memory only, then discarded. `photo_drive_id` and `photo_drive_path` stay null until the Drive sync ships.

## Resolved

- **2026-05-09 — Schema drift on `closings` and `expenses` insert (commit `c58440a`).** Submissions failed against the live DB because the insert payload included three columns the live schema disagrees on:
  - `photo_storage_url` — never created (D6 pivoted to Drive-only). Dropped from inserts.
  - `grand_total` — defined in the live DB as a `GENERATED ALWAYS AS (cash_total + card_total + online_total)` column. Postgres rejects writes. Dropped from insert; reads still work.
  - `over_short` — same story (`GENERATED ALWAYS`). Dropped from insert.
  Side fix: `CloseFlow` review screen now renders grand total as a live-computed read-only display (cash + card + online), with an amber hint if the AI's read of the receipt's grand total disagrees with the breakdown by more than 0.02 AED. UX matches DB reality — sub-totals are inputs, grand total is derived.
