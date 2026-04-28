---
name: calendxr-calendar
description: Use for CALENDXR Calendar item logic: CRUD, move/reschedule, done/delete, recurrence, occurrence/series behavior, selected-day panel, daily/weekly item queries.
---

# CALENDXR Calendar

Use this skill for Calendar item logic, CRUD, move/reschedule, done/delete, recurrence, occurrence and series behavior, selected-day panel work, and daily/weekly item queries.

## Current Model

- CALENDXR uses a unified item model.
- Items may be timed or untimed.
- Items have status semantics including todo, done, and canceled.
- Items support colors, recurrence, occurrence edit/delete, series edit/delete, and move/reschedule flows.
- Web Calendar move/reschedule flow exists.
- Telegram move command works.

## Timed And Untimed Items

- Preserve the distinction between timed and untimed items.
- For normal item moves, update `day`, `timeStart`, and `timeEnd`.
- Preserve title, details, color, status, and kind unless the task explicitly changes them.
- Keep UI and Telegram summaries consistent with the stored item shape.

## Recurrence Guardrails

- Never accidentally affect a whole recurring series when editing, deleting, or moving one occurrence.
- Preserve the occurrence vs series distinction.
- Reuse existing recurrence utilities and occurrence override logic.
- Include the base day when it matches the recurrence rule.
- If an occurrence operation is unsupported, state the limitation rather than hacking recurrence state.

## Persistence Loop

Verify the full persistence loop for item changes:

```txt
create/edit/move/delete -> save/API -> refresh -> still correct
```

For Telegram flows, confirm user-facing output reflects persisted backend data and never exposes database IDs.

## API And Data Changes

- Keep patches focused around the existing Calendar data contracts.
- Do not add API fields casually; check all readers and writers first.
- If schema changes are required, use `$calendxr-db-migrations`.
- Do not leave frontend, Telegram, or cron code expecting missing production columns.

## Validation Checklist

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- For move/reschedule changes, verify day/time changes while other item fields remain intact.
- For recurrence changes, verify occurrence-level behavior and series-level behavior separately.
- Confirm done/canceled filtering remains correct in daily and weekly item queries.
