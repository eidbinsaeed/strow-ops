# Strow Ops — Credentials Inventory

**Last updated:** 2026-05-08

> **Names only. Never put values in this file. Reference where each lives (Vercel env, Supabase project settings, etc).**

---

## ⚠️ Action required

All credentials shared in the original brief Section 8 — legacy admin login, test client login, Whapi token, Whapi channel ID, all Twilio creds — are exposed in chat history. **Owner must rotate all of them before v1 deploys.** Until rotated, treat them as compromised.

---

## Active credentials (post-rotation)

### Supabase (new project)
- `NEXT_PUBLIC_SUPABASE_URL` — Vercel env, public OK
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Vercel env, public OK
- `SUPABASE_SERVICE_ROLE_KEY` — Vercel env, **server-only**

### Anthropic
- `ANTHROPIC_API_KEY` — Vercel env, server-only. Used for receipt extraction (Sonnet 4.6).

### Google Drive
- `GOOGLE_DRIVE_CLIENT_ID` — Vercel env
- `GOOGLE_DRIVE_CLIENT_SECRET` — Vercel env, server-only
- `GOOGLE_DRIVE_REFRESH_TOKEN` — Vercel env, server-only
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` — Vercel env (folder ID for `/Strow/`)

### Whapi (Phase 2)
- `WHAPI_TOKEN` — Vercel env, server-only · **rotate from legacy**
- `WHAPI_CHANNEL_ID` — Vercel env · **rotate from legacy**
- `WHAPI_NOTIFICATION_GROUP_ID` — Vercel env

---

## Retired

- All Twilio credentials — module deleted in migration (D12).
- Legacy admin login (`eidadmin@strow.app`) — replaced by new owner auth.
- Legacy test client login — no equivalent in new system.

---

## Storage rules

- All keys live in `process.env`. Never hardcoded in source.
- `NEXT_PUBLIC_*` keys are safe to expose client-side. Anything else is server-only.
- Vercel env vars set per environment (preview / production / development).
- Local dev uses `.env.local` (gitignored — confirm `.gitignore` covers it before first commit).
- Service role key never reaches the client. Only used in API route handlers and edge functions.
