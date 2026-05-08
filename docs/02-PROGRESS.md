# Strow Ops — Progress Log

**Last updated:** 2026-05-09

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

**Owner action items:**
1. **Rotate compromised credentials** — partial Anthropic API key + Google Drive client secret leaked in chat earlier. Legacy Whapi/Twilio creds also need rotation per original brief.
2. Test all CRUD flows on `strow-ops.vercel.app/owner` to catch any edge cases
3. Send sample photo of an actual Qave end-of-day close sheet (Q2) for OCR prompt calibration
4. Decide on owner auth approach: Supabase Auth magic link vs email/password

**Next session goals:**
1. Owner Supabase Auth (proper gating of `/owner/**`)
2. Barista close-of-day flow with photo capture + Anthropic OCR
3. Drive sync background job
4. Audit log writes from all mutations
