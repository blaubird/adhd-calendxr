---
name: calendxr-telegram
description: Use for CALENDXR Telegram bot work: commands, settings, language, digest, reminders, task management, formatting, webhook/polling, Telegram callbacks. Do not use for unrelated web UI or Canvas work.
---

# CALENDXR Telegram

Use this skill for Telegram Bot API work, command handling, settings, language selection, daily digest/reminders, webhook/polling, Telegram callbacks, and Telegram task-management flows.

## Current State

- Production webhook and local polling both exist.
- Native Telegram command menu exists.
- Supported commands include `/start`, `/help`, `/today`, `/tomorrow`, `/week`, `/settings`, and `/language`.
- Task management commands include done, delete, and move flows.
- Freeform calendar creation uses AI draft creation with Confirm / Cancel.
- Daily morning digest/reminders are enabled through settings.
- The selected bot interface language is persisted.
- Allowed chat protection and webhook secret validation must remain intact.
- Vercel Hobby-compatible daily digest cron exists.
- Browser notifications, 5-minute Vercel Hobby cron, broad summary action buttons, and persistent reply keyboards are not part of the current product.

## Languages

Support Telegram interface languages in this exact order:

1. English `en`
2. French `fr`
3. Ukrainian `uk`
4. Russian `ru`

Keep labels and settings flows consistent across these languages.

## Formatting

- Keep messages plain and practical.
- Use simple headings, line breaks, and numbered lists.
- Avoid emoji-heavy formatting.
- Do not use decorative text-like symbols such as `☾`, `◇`, `◦`, or `□`.
- Never expose database IDs in user-facing Telegram output.

## Buttons

Allowed:

- AI draft Confirm / Cancel.
- Settings and language buttons.
- Delete or destructive confirmation buttons.

Avoid unless explicitly requested:

- Broad inline buttons under `/today`, `/tomorrow`, or `/week`.
- Persistent reply keyboards.
- Task action button spam.

Do not break the existing AI draft Confirm / Cancel flow.

## Routing

Do not call OpenAI for deterministic Telegram paths:

- Slash commands.
- Settings callbacks.
- Language callbacks.
- Task-management commands.
- Reminder or digest cron jobs.

Freeform calendar creation can use the existing AI draft flow. Calendar answers must come from backend data, not model memory.

## Daily Digest And Reminders

- Digest/reminders are opt-in through `/settings`.
- They are disabled by default.
- Use the existing once-daily Vercel Hobby-compatible cron model.
- Do not add 15-minute timed reminders on Vercel Hobby.
- Do not add browser notifications.
- Do not add reminder action buttons unless explicitly requested.
- Include recurrence-expanded items.
- Skip done and canceled items.
- Do not send an empty digest when there is nothing useful to send.

## Security

- Preserve allowed-chat protection.
- Preserve webhook secret validation.
- Never log bot tokens, webhook secrets, chat IDs intended as secrets, or environment values.
- Never commit `.env` or `.env.local`.

## Validation Checklist

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- Test affected commands or callbacks locally when feasible.
- Confirm deterministic commands do not call OpenAI.
- Confirm language/settings flows still work.
- Confirm no secrets or private env values appear in diffs or logs.
