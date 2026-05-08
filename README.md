# Strow Ops

Café operations and billing system for Qave Cafe (Al Ain, UAE) and future Strow locations.

## What this is

A two-role responsive web app:

- **Barista (mobile-first):** PIN login → photograph end-of-day close or supplier receipts → AI extracts the data → confirm. Whole flow under 30 seconds.
- **Owner (desktop + mobile):** dashboard, daily sales, expenses, suppliers, fixed costs, liabilities, P&L. Photo + extracted data side-by-side. Audit trail back to original receipt.

## Stack

- **Framework:** Next.js 15 (App Router) + React 19
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (Postgres + custom JWT auth for baristas)
- **Photo storage:** Google Drive (`/Strow/[Location]/[YYYY-MM]/...`)
- **AI extraction:** Claude Sonnet 4.6 via Anthropic API
- **Hosting:** Vercel
- **Notifications (Phase 2):** WhatsApp via Whapi

## Project memory

Everything important — phasing, decisions, schema, open questions, business context — lives in [`/docs/`](./docs/00-README.md). Read that first before making any change.

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in real values
cp .env.example .env.local
# (fill in Supabase, Anthropic, Drive credentials)

# 3. Run dev server
npm run dev
# → http://localhost:3000
```

## Phase status

See [`/docs/01-PLAN.md`](./docs/01-PLAN.md). Currently: **Phase 0 — Foundations**.

## License

Private. Not licensed for redistribution.
