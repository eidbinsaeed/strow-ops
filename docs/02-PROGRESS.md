# Strow Ops — Progress Log

**Last updated:** 2026-05-08

---

## Session 2 — 2026-05-08
**Outcome:** Phase 0 scaffolding committed. Schema v1 migrations written, ready to apply.

**Done:**
- Repo `strow-ops` cloned locally to `C:\Users\eidbi\Projects\strow-ops`
- Next.js 15 App Router scaffold generated with Tailwind 4 and Supabase client setup
- Supabase clients: browser (`src/lib/supabase/client.ts`), server (`src/lib/supabase/server.ts`)
- TypeScript types placeholder (`src/types/database.ts`) — to be regenerated post-migration
- `.env.example` with all required env var names (no values)
- D6 revised: Drive primary, no Supabase Storage for photos. Saves $300/yr Pro plan cost; Drive free tier covers ~3 years for Qave-only volume
- DATA_MODEL.md updated: dropped `photo_storage_url` columns
- Schema v1 migration written (`supabase/migrations/0001_initial_schema.sql`) — 12 tables, indexes, triggers, seed data for `qave_main` location and 11 default expense categories
- RLS policies v1 written (`supabase/migrations/0002_rls_policies.sql`) — owner-only access. Barista RLS deferred until PIN auth + custom JWT claims land.

**Skipped / blocked:**
- Supabase project creation via MCP — connection scope didn't include create permissions. Owner doing it manually at supabase.com.

**Owner action items:**
1. Create Supabase project at supabase.com/dashboard (org: streamly.app, name: `strow-ops`, region: ap-south-1 Mumbai, free plan). **In progress.**
2. After creation, drop the project ref/URL into chat so I can list it via MCP and apply migrations.

**Next session goals:**
- Apply 0001 + 0002 migrations to the new Supabase project
- Generate TypeScript types from live schema
- Wire owner auth (Supabase Auth + first owner record)
- Begin PIN auth design (custom JWT minting flow)

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

**Skipped / deferred:**
- Legacy repo audit — not blocking new scaffold; will harvest from legacy only when needed (Whapi mainly)
- Code/scaffolding — Phase 0 prep work first

**Owner action items (in order of urgency):**
1. **Rotate all credentials** in legacy Section 8 of brief — they're now in chat history
2. Create new `strow-ops` GitHub repo and grant access (or paste in package.json + schema if no access)
3. Send a sample photo of an actual Qave end-of-day close sheet for AI prompt calibration

**Next session goals:**
- Once new repo exists: scaffold Next.js + Tailwind + Supabase
- Drop memory folder into `/docs/`
- Design schema v1 in detail and migrate
- Wire PIN auth flow

---

## Session 2 — 2026-05-08
**Outcome:** GitHub repo cloned locally, project memory committed as first commit.

**Done:**
- Confirmed tooling on owner's machine: node v24.15.0, git 2.53.0.windows.1, git user `eidbinsaeed <eidbinsaeed@gmail.com>`
- Diagnosed and worked around Desktop Commander/PowerShell stdout capture quirk on Windows (write to file → read via cmdlet)
- Cloned empty `strow-ops` repo to `C:\Users\eidbi\Projects\strow-ops`
- Wrote 11 docs files into `docs/` folder
- Committed and pushed initial commit

**Skipped / deferred:**
- GitHub MCP — not available in claude.ai web directory; using Desktop Commander to drive git locally instead
- Next.js scaffolding — next session

**Next session goals:**
- Scaffold Next.js 15 + App Router + Tailwind + Supabase client setup
- Generate `package.json`, configs, `.gitignore`, `.env.example`
- `npm install` and verify dev server runs
- Provision new Supabase project via MCP
- Apply schema v1 migration
