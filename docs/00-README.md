# Strow Ops — Project Memory

This folder is the **single source of truth** for project state. Every meaningful decision, change, and conversation note lives here. When a new Claude chat starts on this project, it reads these files first.

**Last updated:** 2026-05-15

## Files

| File | Purpose |
|---|---|
| `00-README.md` | This file — index and how-to |
| `01-PLAN.md` | Phasing plan with current status |
| `02-PROGRESS.md` | Session log of what was actually built |
| `03-DECISIONS.md` | Locked decisions with date, rationale, alternatives |
| `04-DATA_MODEL.md` | Postgres schema (current and proposed) |
| `05-INFRASTRUCTURE.md` | What's deployed where, env var inventory |
| `06-OPEN_QUESTIONS.md` | Live questions for the owner |
| `07-KNOWN_ISSUES.md` | Bugs, edge cases, technical debt |
| `08-CREDENTIALS_INVENTORY.md` | Secret names only (never values) |
| `09-CHANGELOG.md` | Version history |
| `10-CONVERSATION_NOTES.md` | Owner preferences, context, business details |

## How to start a new chat

1. Read `02-PROGRESS.md` — where we left off.
2. Read `06-OPEN_QUESTIONS.md` — what's pending.
3. Skim `03-DECISIONS.md` — to avoid re-litigating settled questions.
4. Confirm to the owner: *"Read project memory. Last session did [X]. Open questions: [Y]. Proceeding with [Z]?"*

## Rules

- **Never put credential values in any file here.** Reference names only.
- Update relevant files in the same session as the work — don't defer.
- Commit with descriptive messages. Git history of these files is itself a record.
- At session end: update `02-PROGRESS.md`, `06-OPEN_QUESTIONS.md`, and `01-PLAN.md` status.
- When in doubt, write it down. Memory is the most important deliverable.
