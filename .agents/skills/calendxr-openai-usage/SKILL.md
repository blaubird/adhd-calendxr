---
name: calendxr-openai-usage
description: Use for CALENDXR OpenAI API work: model/prompt updates, AI draft parsing, Telegram intent routing, official OpenAI docs checks, and safe AI behavior.
---

# CALENDXR OpenAI Usage

Use this skill for OpenAI API work in CALENDXR: model or prompt updates, AI draft parsing, Telegram/calendar intent routing, parser contracts, schemas, and safe AI behavior.

## Current Usage

OpenAI is used for:

- Calendar draft generation.
- Telegram/calendar intent routing where applicable.

OpenAI must not be used as a replacement for deterministic command routing or backend data reads.

## Hard Rules

- Do not call OpenAI for slash commands.
- Do not call OpenAI for settings callbacks.
- Do not call OpenAI for language callbacks.
- Do not call OpenAI for task-management commands.
- Do not call OpenAI for reminder or digest cron jobs.
- Do not let OpenAI directly write, delete, or move calendar items without confirmation.
- Do not answer calendar questions from model memory; use backend/calendar data as the source of truth.
- Do not include secrets, tokens, env values, or private credentials in prompts or logs.

## AI Drafts

- Freeform calendar creation can use the existing AI draft flow.
- Drafts require explicit Confirm / Cancel before saving.
- Preserve parser contracts and validation schemas.
- Keep Telegram and web behavior aligned with persisted backend data.

## Docs And API Changes

- For OpenAI API, model, or SDK changes, use the `openai-docs` skill when available and/or official OpenAI documentation.
- Do not rely on stale memory for current OpenAI API details.
- Avoid broad prompt rewrites without auditing downstream parser expectations and tests.

## Validation Checklist

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- Validate parser contracts and schemas after prompt or model changes.
- Confirm deterministic commands/settings/callbacks/cron do not call OpenAI.
- Confirm no secrets appear in prompts, logs, diffs, or committed files.
