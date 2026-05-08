# Strow Ops — Infrastructure

**Last updated:** 2026-05-08

---

## Existing (legacy — to be migrated/retired)

| Resource | Detail |
|---|---|
| Production app | https://www.strow.app |
| Admin subdomain | https://admin.strow.app |
| Vercel project | `uae-ai-saas` (org: `eidbinsaeed-5986s-projects`) |
| GitHub repo | https://github.com/eidbinsaeed/uae-ai-saas |
| Supabase project | (legacy — see brief Section 7) |
| DNS provider | Cloudflare |
| Domain registrar | Namecheap (registration only) |

## Planned (Strow Ops new)

| Resource | Detail |
|---|---|
| GitHub repo | https://github.com/eidbinsaeed/strow-ops (created 2026-05-08) |
| Local clone | `C:\Users\eidbi\Projects\strow-ops` |
| Vercel project | `strow-ops` — TBD |
| Supabase project | new project — TBD |
| Domain | `strow.app` — cut over at v1 |
| Legacy branch | `legacy/sara` on existing repo — frozen for reference |

## Env vars (names only — values in `08-CREDENTIALS_INVENTORY.md`)

**Required for v1:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

**Required for Phase 2 (WhatsApp staff notifications):**
- `WHAPI_TOKEN`
- `WHAPI_CHANNEL_ID`
- `WHAPI_NOTIFICATION_GROUP_ID`

## Build & deploy

- Vercel auto-deploys from `main` branch
- Preview deploys per PR
- Local dev uses `.env.local` (gitignored)
- Supabase migrations tracked in `supabase/migrations/`
