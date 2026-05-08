# Strow Ops — Conversation Notes

**Last updated:** 2026-05-08

Owner-shared context worth preserving across sessions. New chats should skim this before responding.

---

## About the owner

- **Eid binSaeed**, owner of **Qave Cafe** in Al Ain, UAE.
- Also developing an artisan pizza concept and a bakery (planned future "locations" under one owner account).
- Technical-ish but runs a café, not a software team. Prefers plain-language explanations and business-framed tradeoffs.
- Often interacts from a phone — keep responses scannable on mobile.
- Communicates casually, sometimes with typos. Tone: friendly, fast, low-ceremony. Not corporate.

## Working preferences

- **Likes:** quick decisions, fewer clarifying questions, working slices early, getting surprised with sensible defaults.
- **Dislikes:** lots of asking, over-engineering, heavy abstractions, multi-tenant SaaS thinking, jargon for jargon's sake.
- **Flexibility:** will change scope mid-flight; expects Claude to adapt without resistance. Previous decisions aren't sacred — when he changes his mind, just adapt.
- Quote (session 1): *"just surprise me"* — comfortable with broad delegation when the context is locked. Use this trust carefully: make defensible defaults, log them in `03-DECISIONS.md`, surface the small remaining unknowns in `06-OPEN_QUESTIONS.md`.

## Business context

- **Currency:** AED.
- **VAT:** 5% UAE.
- **Timezone:** Asia/Dubai (GST / UTC+4).
- **Weekend:** Friday–Saturday.
- **Volume:** ~3–5 photos/day per location. Cost of AI calls is trivial — optimize for accuracy over cost.
- **Suppliers:** mix of formal invoiced + informal cash receipts. Bilingual (Arabic/English) and inconsistent date formats are normal.

## Brand & product

- **Brand:** Strow (kept from legacy product).
- **Product name:** Strow Ops (locked 2026-05-08).
- **Old product:** WhatsApp AI agent "Sara" — fully deprecated. Customer-facing parts are dead. Whapi integration is repurposed for outbound staff/owner notifications in Phase 2.

## Philosophical preferences

- One responsive app, never separate mobile/desktop codebases.
- Owner dashboard must work as well on phone as on laptop.
- Photo + extracted data side-by-side is the killer feature — never compromise it.
- Audit trail back to the original photo is non-negotiable.
- "Default to my UAE context" — AED, 5% VAT, GST timezone, Fri–Sat weekend.

## Local dev environment

- Windows 10/11, project root: `C:\Users\eidbi\Projects\strow-ops`
- Legacy repo lives at `C:\Users\eidbi\Projects\uae-ai-saas`
- Node v24.15.0, git 2.53.0, npm available
- git config: `eidbinsaeed <eidbinsaeed@gmail.com>`
- Working through Claude Desktop with Desktop Commander + Supabase + Drive + Cloudflare MCPs
