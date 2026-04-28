---
name: calendxr-task-workflow
description: Use for structuring CALENDXR Codex tasks, phased implementation prompts, acceptance criteria, guardrails, validation checklists, and deliverables.
---

# CALENDXR Task Workflow

Use this skill to structure CALENDXR Codex tasks, phased implementation prompts, acceptance criteria, guardrails, validation checklists, and final deliverables.

## Preferred Task Shape

Use concise markdown with:

- Context.
- Phase boundary.
- Explicit scope.
- Do / Do Not lists.
- Guardrails.
- Validation checklist.
- Deliverable expectations.

The user likes detailed markdown prompts, but repo skills should let future prompts become shorter by referencing the relevant skill.

## Implementation Principles

- Prefer focused patches.
- Avoid broad rewrites.
- Keep unrelated files untouched.
- Preserve stable product decisions.
- Match existing project patterns.
- Stop and report when a request conflicts with production safety, secrets safety, or recurrence/data integrity.

## Phase Boundaries

Define whether the task is:

- Documentation/instruction infrastructure.
- UI polish.
- Telegram behavior.
- Calendar item logic.
- Database/migration work.
- OpenAI prompt/model work.
- Deployment or production operations.

Do not let one phase silently expand into another.

## Validation

Default validation commands:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

For database work, also use the DB migration checklist. For UI work, inspect responsive behavior. For Telegram work, test commands/callbacks when feasible.

## Security And Migration Reminders

- Never commit secrets or env files.
- Never log secrets.
- Mention production migration requirements when schema changes occur.
- Do not leave app code expecting missing production columns.

## Deliverable Format

Report:

- Files changed.
- What changed and why.
- Validation results.
- Migration/deployment notes when relevant.
- Known limitations or follow-ups.
- Confirmation of no unrelated app behavior changes when applicable.
