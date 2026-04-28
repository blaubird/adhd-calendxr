# CALENDXR Agent Guide

## Project Summary

CALENDXR / Calendar Brain is a personal productivity command center, not a SaaS. Favor usability, speed, stability, phased development, and the user's personal workflow over enterprise-style abstraction.

## Core Architecture

The app uses Next.js App Router, React, TypeScript, NextAuth, Drizzle ORM, Neon Postgres, Vercel, OpenAI API, Telegram Bot API, Calendar, Canvas, Gambling, daily Telegram digest/reminders, task commands, and web calendar move/reschedule flows.

Protected main shell:

```txt
Calendar
Canvas
Gambling
Telegram Bot
```

## Development Rules

- Keep patches focused and avoid broad rewrites.
- Do not change unrelated modules or behavior.
- Prefer existing local helpers, patterns, and utilities.
- Preserve current production behavior unless the task explicitly changes it.
- Do not install packages unless explicitly requested.
- Do not commit generated artifacts such as `tsconfig.tsbuildinfo`.

## Validation

Run these before delivering code or instruction-infrastructure changes when feasible:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

If a failure appears unrelated to the change, report it clearly with the command and error.

## Security

- Never commit `.env`, `.env.local`, secrets, tokens, API keys, or credentials.
- Never log secrets or include them in prompts.
- Preserve allowed-chat checks, webhook secret validation, and auth boundaries.
- Treat production data and Neon schema changes carefully.

## Database & Migrations

- If schema changes are needed, update Drizzle schema and create a migration.
- Do not leave app code expecting tables or columns that do not exist in production.
- Document migration requirements in the deliverable.
- Validate with typecheck, lint, and build after schema or persistence changes.

## Telegram Guardrails

- Keep Telegram messages plain: simple headings, line breaks, and numbered lists.
- Support interface languages in this order: English `en`, French `fr`, Ukrainian `uk`, Russian `ru`.
- Do not use persistent reply keyboards unless explicitly requested.
- Avoid broad inline buttons under `/today`, `/tomorrow`, and `/week` unless explicitly requested.
- Do not call OpenAI for slash commands, settings callbacks, language callbacks, task-management commands, or cron jobs.
- Preserve AI draft Confirm / Cancel behavior, allowed-chat protection, webhook secret validation, local polling, and production webhook support.
- Vercel Hobby uses a once-daily digest cron; do not implement 5-minute reminders or browser notifications unless the deployment plan changes.

## Calendar & Recurrence Guardrails

- Preserve the unified item model, timed/untimed items, colors, recurrence, status semantics, and move/reschedule behavior.
- For normal moves, update `day`, `timeStart`, and `timeEnd` while preserving title, details, color, status, and kind.
- Do not accidentally mutate a whole recurring series when editing, deleting, or moving one occurrence.
- Reuse existing recurrence and occurrence override utilities.
- Include the base day when it matches the recurrence rule.
- Verify the persistence loop: create/edit/move/delete -> save/API -> refresh -> still correct.

## UI Direction

The visual direction is dark, cold, black-heavy, subtle glass, premium, command-center, and slightly futuristic. Avoid giant chunky UI, neon overload, childish colors, random font-size chaos, global transform scaling, and oversized mobile-like desktop layouts.

Future richer glass, animations, customizable backgrounds, accent colors, moon skins, cosmetics, and achievements are postponed unless explicitly requested.

## Repo Skills

Repo-scoped skills live in `.agents/skills/`. Use them for recurring CALENDXR work:

- `$calendxr-telegram`
- `$calendxr-calendar`
- `$calendxr-db-migrations`
- `$calendxr-ui`
- `$calendxr-task-workflow`
- `$calendxr-openai-usage`

Load the relevant skill before changing that area.

## Deliverable Expectations

Report files changed, validation results, migration/deployment notes when relevant, and any known limitations. Confirm when no app behavior changed and no secrets were committed.
