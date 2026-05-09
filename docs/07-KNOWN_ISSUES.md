# Strow Ops - Known Issues & Tech Debt

**Last updated:** 2026-05-09 (Session 6 final)

---

## Open

- **Legacy repo not yet audited.** Whapi integration code needs to be located in `uae-ai-saas` and ported cleanly to the new `strow-ops` repo when Phase 2 starts.
- **Per-field confidence is heuristic.** Anthropic API doesn't return per-field confidence natively. The model self-rates each field in its JSON output. Calibration needed against real receipts.
- **Bilingual receipts + Arabic numerals.** OCR prompt instructs explicitly on Arabic numeral interpretation but accuracy is unverified until real samples arrive.
- **Date format inconsistency (DD-MM vs MM-DD).** Normalization happens in the prompt but is unverified.
- **Legacy credentials exposed in chat history.** Owner action: rotate before v1 cutover.
- **No real receipt sample yet.** OCR prompt calibration is blocked on photos of an actual Qave end-of-day close sheet and a supplier invoice.
- **Drive sync needs OWNER_DRIVE refresh token.** Run `node scripts/get-drive-refresh-token.mjs` once and set GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_ROOT_FOLDER_ID before Drive sync goes live. Code is in place and gates itself on `isDriveConfigured()` - submissions still succeed with null photo URLs if the env isn't ready.
- **`owners` row not auto-populated.** Owner-side audit entries log `actor_type=owner` with `actor_id=null`. Tolerable until per-owner identity is needed.
- **Service worker is conservative.** Caches only static assets and the manifest. Auth-sensitive routes (/api, /owner, /login, /today) always go to network. Aggressive shell caching can ship later if needed.

## Resolved

- **2026-05-09 (Session 6) - Owner PIN auth, review queue actions, Drive photo sync, PWA shell, offline submit queue.** Phase 1 + Phase 1.5 closed end-to-end.
- **2026-05-09 (Session 6) - Audit log writes wired across all mutations.** Barista submissions and owner CRUD all write to `audit_log` via `writeAudit`. Sensitive fields (PIN) are never logged.
- **2026-05-09 (Session 5) - Schema drift on `closings` and `expenses` insert (commit `c58440a`).** Dropped `photo_storage_url` (never created), `grand_total`, and `over_short` (both GENERATED ALWAYS) from inserts. CloseFlow review now renders grand total as a live-computed read-only display.
