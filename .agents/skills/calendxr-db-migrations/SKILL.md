---
name: calendxr-db-migrations
description: Use for CALENDXR database/schema work with Drizzle, Neon Postgres, migrations, env vars, production migration safety, and data persistence changes.
---

# CALENDXR DB And Migrations

Use this skill for Drizzle schema work, Neon Postgres persistence changes, migrations, env vars, production migration safety, and database-backed behavior.

## Discipline

- Update the Drizzle schema when persistence shape changes.
- Create a migration for schema changes.
- Keep app code, migrations, and production schema expectations aligned.
- Do not leave code expecting tables or columns that do not exist in production.
- Document migration and deployment requirements in the deliverable.
- Keep generated artifacts such as `tsconfig.tsbuildinfo` ignored.

## Neon Production Safety

- Treat production Neon data as durable user data.
- Prefer additive, backward-compatible migrations when possible.
- Avoid destructive migrations unless explicitly requested and clearly documented.
- Check readers, writers, Telegram flows, cron routes, and UI paths before changing schema contracts.

## Migration Checklist

- Update Drizzle schema.
- Generate or write the migration.
- Review generated SQL for safety.
- Confirm no unrelated migration files changed.
- Run validation commands.
- Mention production migration requirement before deployment.

## Env And Secrets

- Never commit `.env`, `.env.local`, tokens, database URLs, API keys, webhook secrets, or private credentials.
- Never log secrets in local scripts, tests, route handlers, or build output.
- Use env names without exposing values when documenting setup.

## Validation Checklist

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- If migration tooling is used, report the exact command and result.
- Inspect `git diff --stat` and `git status` before commit.
- Confirm no secrets and no generated artifacts are staged.

## Deliverable Expectations

Report schema files changed, migration files created, validation results, production migration requirements, and any data backfill or rollback concerns.
