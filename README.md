# Calendar Brain (Calendxr)

A calm 7-day calendar/task board for one authenticated user, built with Next.js App Router, NextAuth, Drizzle ORM, and Neon Postgres. Voice capture uses the browser Web Speech API to draft items; nothing is stored until you confirm.

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

## Database & migrations

Schema is defined in [`app/schema.ts`](app/schema.ts) and migrations live in [`drizzle/`](drizzle). The initial migration creates `users` and `items` tables with enums for item kind and task status.

- Generate/apply migrations locally (requires `DATABASE_URL`):

```bash
pnpm migrate:push
```

- CI/CD: configure a GitHub Actions secret `DATABASE_URL`. The included workflow `.github/workflows/migrations.yml` runs migrations on pushes to `main`.

## Core features

- Authenticated-only UI and APIs (NextAuth credentials provider).
- 7-day sliding board with previous/next/today navigation.
- Items scoped per user with create/edit/delete and task status updates.
- Voice capture → parsing endpoint → manual draft confirmation before saving.
- Zod validation on API inputs and draft parsing contract.

## Notes

- All dates are stored as `YYYY-MM-DD` with Europe/Paris-friendly defaults on the parser. Times are optional and sort timed items first.
- Speech recognition depends on browser support (webkit implementation on Chrome). If unsupported, the UI surfaces an error and you can still add items manually.
