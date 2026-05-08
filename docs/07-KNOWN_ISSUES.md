# Strow Ops — Known Issues & Tech Debt

**Last updated:** 2026-05-08

---

## Open

- **Legacy repo not yet audited.** Whapi integration code needs to be located in `uae-ai-saas` and ported cleanly to the new `strow-ops` repo when Phase 2 starts.
- **Per-field confidence is heuristic.** Anthropic API doesn't return per-field confidence natively. Implementation will rely on the model self-rating each field in its JSON output. Calibration needed against real receipts before trusting the green/amber thresholds.
- **Bilingual receipts + Arabic numerals (٠–٩).** Standard OCR libraries often misread these. The extraction prompt must explicitly instruct on Arabic numeral interpretation.
- **Date format inconsistency.** UAE receipts use DD-MM, MM-DD, DD/MM/YY, sometimes mixed within one document. Requires explicit normalization step before storing — and possibly a "raw date string" column preserved alongside the parsed `date` column.
- **Legacy credentials exposed in chat history.** Owner action: rotate before v1 deploy. Tracked in `08-CREDENTIALS_INVENTORY.md`.
- **No real receipt sample yet.** Calibration of the extraction prompt is blocked on a photo of an actual Qave end-of-day close sheet.
- **Desktop Commander stdout quirk on Windows.** External binary stdout doesn't pipe back through PowerShell wrapper; workaround is to redirect to a file and read via `Get-Content`. Affects scripted git/npm/node calls but not Desktop Commander's native `write_file`/`read_file` operations.

## Resolved

*(none yet)*
