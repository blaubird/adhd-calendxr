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

- `DATABASE_URL` – Postgres connection string (Neon recommended). `POSTGRES_URL` is still respected for backward compatibility.
- `AUTH_SECRET` – NextAuth secret.
- `NEXTAUTH_URL` or `AUTH_URL` – set to the deployed URL (`https://calendar.luminiteq.eu`).
- `OPENROUTER_API_KEY` – server-side key for draft generation.
- `OPENROUTER_MODEL` – optional override (defaults to `google/gemma-3-27b-it:free`).
- `APP_TIMEZONE` – optional timezone override; defaults to `Europe/Paris`.

## Database & migrations

Schema is defined in [`app/schema.ts`](app/schema.ts) and migrations live in [`drizzle/`](drizzle). The initial migration creates `users` and `items` tables with enums for item kind and task status.

- Generate/apply migrations locally (requires `DATABASE_URL`):

```bash
pnpm db:migrate
```

- CI/CD: configure a GitHub Actions secret `DATABASE_URL`. The included workflow `.github/workflows/migrations.yml` runs migrations on pushes to `main`.

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
