# Calendar Brain (Calendxr)

A calm 4-day calendar/task board for one authenticated user, built with Next.js App Router, NextAuth, Drizzle ORM, and Neon Postgres. Voice capture uses the browser Web Speech API to draft items; nothing is stored until you confirm.

## Getting started

1. Install dependencies

```bash
pnpm install
```

2. Set environment variables (see below).

3. Run the dev server

```bash
pnpm dev
```

Open http://localhost:3000 – you will be redirected to sign in.

## Environment variables

Runtime (Vercel):
- `POSTGRES_URL` – pooled Postgres connection string used by the app at runtime.

CI/Local migrations:
- `POSTGRES_URL_NON_POOLING` – direct/non-pooling URL used for migrations (map to `DATABASE_URL` in CI).

Other:
- `DATABASE_URL` – used by drizzle-kit for migrations in CI/local only (set to the non-pooling URL).
- `AUTH_SECRET` – NextAuth secret.
- `NEXTAUTH_URL` – set to the deployed URL (`https://calendar.luminiteq.eu`).
- `OPENAI_API_KEY` – server-side key for draft generation.
- `OPENAI_MODEL` – optional model override for draft generation.
- `APP_TIMEZONE` – optional timezone override; defaults to `Europe/Paris`.
- `APP_BASE_URL` – local or production base URL used by Telegram webhook setup.
- `TELEGRAM_BOT_TOKEN` – Telegram bot token.
- `TELEGRAM_CHAT_ID` – chat that receives digest messages.
- `TELEGRAM_ALLOWED_CHAT_ID` – only this chat can use the bot.
- `TELEGRAM_WEBHOOK_SECRET` – secret token Telegram sends to the webhook route.
- `TELEGRAM_MODE` – `polling` locally, `webhook` in production.
- `TELEGRAM_TIMEZONE` – Telegram-facing timezone, usually `Europe/Paris`.
- `TELEGRAM_DIGEST_HOUR` – desired local digest hour, usually `9`.
- `CRON_SECRET` – secret used to protect Telegram cron endpoints.

## Database & migrations

Schema is defined in [`app/schema.ts`](app/schema.ts) and migrations live in [`drizzle/`](drizzle). The initial migration creates `users` and `items` tables with enums for item kind and task status.

- Generate/apply migrations locally (requires non-pooling `DATABASE_URL`):

```bash
DATABASE_URL=$POSTGRES_URL_NON_POOLING pnpm db:push
```

- CI/CD: configure GitHub Actions secret `POSTGRES_URL_NON_POOLING`. The workflow `.github/workflows/migrate-deploy.yml` verifies the secret and runs migrations. Production deploys are handled by the connected Vercel Git integration on pushes to `main`.

## Core features

- Authenticated-only UI and APIs (NextAuth credentials provider).
- 4-day focused board with previous/next/today navigation.
- Items scoped per user with create/edit/delete and task status updates.
- Voice capture → parsing endpoint → manual draft confirmation before saving.
- Zod validation on API inputs and draft parsing contract.

## Item API contract

- All requests are scoped to the authenticated session; the server derives `userId` from the session and ignores any `userId` fields in client payloads.
- `POST /api/items` expects `{ kind, day, title, timeStart?, timeEnd?, details?, status? }`.
- `PUT /api/items/:id` uses the same shape as `POST` and updates only the caller's items.

## Notes

- All dates are stored as `YYYY-MM-DD` with Europe/Paris-friendly defaults on the parser. Times are optional (`HH:mm`, 24-hour) and timed items sort first.
- AI date grounding: server prompts always include the current Europe/Paris datetime and the visible calendar range. Outputs are validated/normalized to ISO day keys and 24-hour times; unclear inputs trigger clarification instead of guessing.
- Speech recognition depends on browser support (webkit implementation on Chrome). If unsupported, the UI surfaces an error and you can still add items manually.

## Telegram Local / Production Workflow

Telegram Phase 1 has two transports that reuse the same shared handler:

- Local polling: `scripts/telegram-dev.ts`
- Production webhook: `POST /api/telegram/webhook`

Both paths enforce `TELEGRAM_ALLOWED_CHAT_ID`, support `/start`, `/help`, `/today`, `/tomorrow`, `/week`, `/settings`, `/language`, natural-language draft creation, and Confirm / Cancel callbacks.

### Local development

Before local polling, remove the Telegram webhook so `getUpdates` can receive messages:

```bash
pnpm telegram:delete-webhook
pnpm dev
pnpm telegram:dev
```

Local `.env` should use:

```env
TELEGRAM_MODE=polling
APP_BASE_URL=http://localhost:3000
```

### Production deployment

After pushing and waiting for Vercel to deploy:

```bash
pnpm telegram:set-commands
pnpm telegram:set-webhook
pnpm telegram:webhook-info
```

`telegram:set-commands` registers the native slash command list, localized command descriptions (`en`, `fr`, `uk`, `ru`), and sets Telegram's native menu button to `commands`. It also applies the menu button to `TELEGRAM_ALLOWED_CHAT_ID` when that env var is present.

`telegram:set-webhook` points Telegram to:

```txt
${APP_BASE_URL}/api/telegram/webhook
```

and sends `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. The token itself is never printed.

Production env should use:

```env
TELEGRAM_MODE=webhook
APP_BASE_URL=https://calendar.luminiteq.eu
```

### Switching back to local

```bash
pnpm telegram:delete-webhook
pnpm telegram:dev
```

### Digest

Local manual digest:

```bash
pnpm telegram:digest
```

Production manual digest test:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://calendar.luminiteq.eu/api/telegram/digest"
```

The digest endpoint sends today's recurrence-expanded items to `TELEGRAM_CHAT_ID` and is protected by `CRON_SECRET`.

### Telegram Reminders

Telegram reminders are disabled by default. Enable or disable them in `/settings`.

When enabled, `/api/telegram/reminders` sends:

- one timed reminder 15 minutes before `timeStart`;
- no timed reminders for untimed or done items;
- recurrence-expanded reminders;
- one untimed morning digest near 09:00 Europe/Paris when there are untimed, not-done items.

Duplicate sends are guarded by `telegram_reminder_deliveries`. Apply migration `0006_telegram_reminders` before enabling reminders in production.

### Vercel Cron

`vercel.json` schedules:

```txt
*/5 * * * *
```

The scheduled path is `/api/telegram/reminders`. The endpoint checks the Europe/Paris app time internally and sends the untimed morning digest only once per day in the morning window. Every-5-minute cron requires a Vercel plan that supports that interval.

Vercel Cron requests include `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is configured in Vercel.

### Webhook security

`POST /api/telegram/webhook` requires:

```txt
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

Invalid or missing secrets are rejected before the update is processed.

### Pending Telegram Drafts

Confirm / Cancel callbacks use the `telegram_pending_drafts` Postgres table, not in-memory state. This keeps production webhook callbacks reliable on Vercel serverless instances and also keeps local polling behavior aligned with production.

### Telegram User Settings

Bot interface language and reminder opt-in state are stored in `telegram_user_settings`, keyed by Telegram chat id. Apply migrations `0005_telegram_user_settings` and `0006_telegram_reminders` before using `/language`, `/settings`, reminders, digest localization, or localized command responses in production.
