# Calendar Brain (Private) — Master Spec v2

**Production domain:** https://calendar.luminiteq.eu  
**Audience:** only me / single owner  
**Current working mode:** local development first, then push to GitHub and deploy through Vercel  
**Primary goal:** a private ADHD-friendly external brain: monthly planning, fast AI draft capture, recurrence, reminders, Telegram access, and playful side features.

---

## 0) Current status snapshot

Calendar Brain is no longer a weekly board prototype. It has evolved into a **monthly command center**.

Current major features already implemented or in active use:

- Auth-protected app
- Monthly calendar layout
- Unified Item-oriented UX
- Recurrence support
- Text-only AI draft creation using a fine-tuned OpenAI model
- Manual confirmation before saving AI drafts
- Custom item colors
- Drag-and-drop ordering for untimed items
- Weather and moon sidebar widgets
- Gambling tab with a 5x3 fun slot machine
- Local development workflow using pnpm
- Telegram bot token/chat/env prepared and tested

Important direction change:

- No voice input as a core feature anymore.
- No weekly 7-day board as the primary UI anymore.
- No visible task/event split in the UI anymore.
- The app should feel like a private command center, not a SaaS product.

---

## 1) Why this exists

I lose plans, tasks, notes, and little life-admin details across chats, memory, screenshots, and random notes. I need one private place that can:

- show the month clearly,
- let me add items quickly,
- use AI to turn messy text into structured drafts,
- support recurring items,
- remind me about the day,
- eventually let me interact through Telegram,
- stay stable without database/deployment chaos.

This is not a public SaaS. It is optimized for:

- speed,
- low friction,
- privacy,
- visual clarity,
- maintainability,
- daily personal usefulness.

---

## 2) Product philosophy

### 2.1 Personal tool, not enterprise software

This project is for one owner. Avoid unnecessary enterprise patterns:

- no multi-tenant overengineering,
- no corporate preview/staging complexity unless explicitly requested,
- no speculative scaling architecture,
- no huge rewrites for theoretical purity.

### 2.2 Draft-first safety

AI must not silently write to the calendar.

Preferred flow:

1. User writes natural language.
2. AI returns structured draft(s).
3. User reviews/edits.
4. User confirms.
5. Only then data is written.

This applies to web AI drafts and Telegram AI drafts.

### 2.3 One user-facing object: Item

The UI should treat everything as one object:

> **Item**

An Item can be:

- timed,
- untimed,
- recurring,
- done,
- colored,
- ordered,
- detailed.

Do not expose old `task` vs `event` concepts in the UI.

Implementation can keep compatibility internally if needed, but the product model is one unified **Item**.

---

## 3) Current app structure and navigation

The protected app has a top navigation bar with primary sections:

- **Calendar**
- **Canvas** — placeholder/future feature for now
- **Gambling**

### 3.1 Calendar tab

The Calendar tab is the main product.

Layout:

```text
LEFT SIDEBAR  >  MONTH GRID  >  SELECTED DAY PANEL
```

### 3.2 Gambling tab

The Gambling tab is a fun side feature. It must remain isolated and must not interfere with the calendar, recurrence, AI, or database logic.

### 3.3 Canvas tab

Canvas is planned for the future. It is not implemented yet.

---

## 4) Calendar UI specification

### 4.1 Main layout

The Calendar view is a monthly command center:

1. **Left sidebar**
   - Month title
   - Previous / next month navigation
   - Paris live date/time with seconds
   - Weather for Paris
   - Moon phase visual

2. **Center month grid**
   - Monday-first
   - Current month only
   - No previous/next month filler days
   - Fixed-size day cells
   - Dots representing items

3. **Right selected-day panel**
   - Selected day header
   - Items for selected day
   - Add item action
   - AI Drafts entry point
   - Item actions and inline details

---

## 5) Item model and behavior

### 5.1 User-facing model

Everything is an **Item**.

Fields conceptually used by the product:

- `id`
- `userId`
- `day` — canonical internal format: `YYYY-MM-DD`
- `timeStart` — optional, `HH:mm` or `null`
- `timeEnd` — optional, `HH:mm` or `null`
- `title`
- `details`
- `status` / completion state
- `recurrenceRule`
- `recurrenceTz`
- `recurrenceUntilDay`
- `recurrenceCount`
- `recurrenceExdates`
- `parentId`
- `occurrenceDay`
- `color`
- `order`
- `createdAt`
- `updatedAt`

### 5.2 Timed and untimed behavior

Untimed Item:

- Has no `timeStart`.
- Appears before timed items in the selected-day panel.
- Can be drag-and-drop ordered.

Timed Item:

- Has `timeStart`.
- Appears after untimed items.
- Sorted chronologically by `timeStart`.
- If `timeEnd` exists, display `HH:mm–HH:mm`.
- If only `timeStart` exists, display only `HH:mm`.

### 5.3 Completion

Any Item can be marked done/undone.

Done items:

- render visually muted/greyed,
- keep their persisted state after refresh,
- do not disappear unless explicitly deleted.

### 5.4 Colors

Each Item can have a custom manual color.

Fallback defaults:

- ordinary/non-recurring item: `#ff96f5`
- recurring item: `#67eb67`
- done/completed item: muted/greyed visual state

Guardrail:

- Custom color must persist after save, refresh, month switch, and day re-selection.
- Defaults must only apply when manual color is missing.

### 5.5 Ordering

Untimed items can be drag-and-drop reordered.

Ordering must persist:

- after refresh,
- after changing day and returning,
- after changing month and returning.

Timed items should remain time-sorted unless a future explicit decision changes this.

---

## 6) Month grid behavior

The center grid represents the selected month.

Rules:

- Monday is first day of week.
- Only days of the current viewed month are shown.
- No filler days from adjacent months.
- Day cells are fixed-size.
- Day cells have spacing and subtle rounding.
- Clicking a day selects it and updates the right panel.
- Today is highlighted.
- Selected day is clearly highlighted.

### 6.1 Dots

Day cells show colored dots for items.

Rules:

- Dots use item colors.
- Done dots are greyed/muted.
- Recurring fallback color is green if no manual color exists.
- Ordinary fallback color is pink if no manual color exists.
- Show all visible dots; do not hide after an arbitrary cap if there is space.
- Do not reintroduce hidden `+N` caps unless explicitly requested.
- Dot order should match the day’s item order: untimed first, then timed by time.

### 6.2 Dot click behavior

Desired behavior:

- Clicking a dot selects the day.
- The selected-day panel focuses or highlights the corresponding item.

This should be supported cleanly without breaking normal day click behavior.

---

## 7) Selected-day panel

The right panel is the main operational surface.

Each item card should support:

- title,
- time if present,
- done/undo action,
- edit button (pencil),
- delete button (cross),
- inline expand on click,
- details only when expanded.

Do not show:

- `Edited` badge,
- technical override state,
- raw recurrence internals,
- visible `task/event` labels,
- kind selector.

### 7.1 Add flow

Add item action lives in the selected-day panel.

### 7.2 AI Drafts entry

AI Drafts entry point lives under the selected-day panel.

It should remain low-friction and should not clutter the main panel when closed.

---

## 8) Recurrence specification

Recurrence already works and must remain stable.

Supported behaviors:

- recurring items in monthly grid,
- recurring items in selected-day panel,
- edit this occurrence,
- edit whole series,
- delete this occurrence,
- delete whole series,
- exdates / deleted occurrences,
- overrides / edited occurrences.

### 8.1 No technical leakage

The user must not see internal recurrence implementation terms:

- no `Edited` badge,
- no raw override labels,
- no parent/occurrence technical metadata.

Recurrence can be implied via color and action options.

### 8.2 Inclusive first occurrence rule

Important guardrail:

If a recurring item’s base day matches its recurrence rule, the base day must appear as the first occurrence.

Example:

```text
item.day = 2026-04-27
rule = every Monday
```

Expected occurrences:

```text
2026-04-27
2026-05-04
2026-05-11
...
```

Not:

```text
2026-05-04
2026-05-11
...
```

If `item.day` does not match the recurrence rule, first occurrence should be the next valid recurrence day after `item.day`.

Guardrails:

- no duplicate occurrence on base day,
- exdates still work,
- overrides still work,
- delete occurrence still works,
- delete whole series still works,
- Telegram-created recurrence and web-created recurrence use the same shared recurrence logic.

---

## 9) AI draft system

### 9.1 Current AI direction

The app uses text-only AI draft creation.

Voice has been removed from the desired UX.

AI should use the existing fine-tuned OpenAI model through server-side env vars.

Expected env vars:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Known model currently used:

```text
ft:gpt-4.1-nano-2025-04-14:luminiteq:calendar:Cn5UR8JN
```

Do not hardcode secrets.

### 9.2 AI draft contract

AI should return structured draft proposals.

The app should preserve this general contract:

```json
{
  "reply": "short assistant message",
  "drafts": [
    {
      "kind": "task",
      "day": "2026-04-24",
      "timeStart": null,
      "timeEnd": null,
      "title": "Buy drain cleaner",
      "details": null,
      "status": "todo",
      "recurrenceRule": null,
      "recurrenceUntilDay": null,
      "recurrenceCount": null
    }
  ],
  "questions": []
}
```

The UI should treat all drafts as unified Items even if legacy `kind` remains internally for compatibility.

### 9.3 AI business rules

- No explicit time → untimed Item.
- Explicit time → timed Item.
- Several actions in one message → split into several drafts.
- Recurrence should be supported.
- Do not invent details.
- Clarifications should be rare.
- If drafts can be produced, produce drafts instead of interrogating the user.
- Drafts must be confirmed before saving.
- Saved/edited draft must disappear from pending draft proposals.

---

## 10) Gambling tab specification

The Gambling tab is a fun isolated side feature.

Hard constraints:

- no real money,
- no payments,
- no real gambling economy,
- no sound,
- no DB persistence required,
- no effect on calendar/recurrence/AI.

### 10.1 Slot layout

Slot is:

```text
5 reels × 3 visible rows = 15 visible cells per spin
```

### 10.2 Symbol set

Exactly 9 unique symbols:

- 💎 Diamond
- 👑 Crown
- 🐸 Frog
- 🌙 Moon
- ☀️ Sun
- 🍆 Eggplant
- 🍌 Banana
- 🍑 Peach
- ⭐ Star

Do not confuse:

- 15 visible cells per spin,
- 9 unique symbol types total.

### 10.3 Symbol weights

Current intended weights:

Common:

- Eggplant — 18
- Banana — 18
- Peach — 18
- Star — 14

Uncommon:

- Frog — 10
- Moon — 9
- Sun — 9

Rare:

- Diamond — 3
- Crown — 3

### 10.4 Paylines

Use 9 paylines:

```ts
const PAYLINES = [
  { name: "Top", rows: [0, 0, 0, 0, 0] },
  { name: "Middle", rows: [1, 1, 1, 1, 1] },
  { name: "Bottom", rows: [2, 2, 2, 2, 2] },

  { name: "V", rows: [0, 1, 2, 1, 0] },
  { name: "Inverted V", rows: [2, 1, 0, 1, 2] },

  { name: "Zigzag Down", rows: [0, 0, 1, 2, 2] },
  { name: "Zigzag Up", rows: [2, 2, 1, 0, 0] },

  { name: "Wave Down", rows: [1, 0, 1, 2, 1] },
  { name: "Wave Up", rows: [1, 2, 1, 0, 1] },
];
```

### 10.5 Win evaluation

The visible grid is the source of truth.

Do not fake wins independently from displayed symbols.

Evaluate consecutive matching windows on each payline:

- 3 consecutive matching symbols → small win
- 4 consecutive matching symbols → medium win
- 5 consecutive matching symbols → big win
- 5 Diamond or 5 Crown → jackpot

Matches do not have to start only from reel 0.

Examples:

- reels 0–2 match → small win
- reels 1–3 match → small win
- reels 2–4 match → small win
- reels 0–3 match → medium win
- reels 1–4 match → medium win
- reels 0–4 match → big/jackpot

### 10.6 Score

Score is fake fun points.

Rules:

- persisted in localStorage,
- survives tab switching,
- survives page refresh,
- no real money,
- no real wallet,
- no hard lockout.

Suggested values:

```ts
const SPIN_COST = 50;

const PAYOUTS = {
  small: 80,
  medium: 180,
  big: 450,
  jackpot: 1500,
};
```

Spinning may remain possible even if score is low/negative, or a fake refill/reset can be provided.

---

## 11) Sidebar widgets

### 11.1 Weather

Weather is for Paris only for now.

Show:

- today,
- tomorrow,
- day after tomorrow.

Each weather block should show:

- weather state icon,
- current temperature clearly above min/max line,
- min/max temperature line,
- lightweight clean presentation.

Open-Meteo is acceptable and preferred for no-key weather.

### 11.2 Moon

Moon phase should be visual, not just text.

Preferred presentation:

- large glassy orb,
- nearly as wide as the sidebar allows,
- elegant dark-friendly appearance,
- optional label/caption underneath.

Moon can be calculated locally. Avoid external dependency unless necessary.

---

## 12) Telegram roadmap and local development mode

Telegram is now planned as a major interaction layer.

The bot token and chat ID are already prepared and tested.

### 12.1 Telegram Phase 1 — local polling foundation

Current planned Telegram Phase 1:

- local polling bot,
- deterministic commands,
- AI draft creation from free text,
- confirm/cancel inline buttons,
- manual digest script,
- no production webhook yet,
- no Vercel Cron yet,
- no broad conversational Q&A yet.

Expected local env vars:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_ALLOWED_CHAT_ID=...
TELEGRAM_WEBHOOK_SECRET=...
TELEGRAM_MODE=polling
TELEGRAM_TIMEZONE=Europe/Paris
TELEGRAM_DIGEST_HOUR=9
APP_BASE_URL=http://localhost:3000
```

`.env` is acceptable for local development if it is not committed.

### 12.2 Telegram Phase 1 commands

Commands:

- `/start`
- `/help`
- `/today`
- `/tomorrow`
- `/week`

Command behavior:

- deterministic DB/calendar queries,
- no OpenAI for commands,
- include recurrence-expanded items,
- untimed first,
- timed sorted by time,
- no AM/PM,
- no technical recurrence internals.

### 12.3 Telegram AI draft creation

Non-command Telegram text should be treated as draft creation input.

Flow:

```text
Telegram text
→ existing AI draft logic
→ structured drafts
→ Telegram proposal with Confirm/Cancel
→ save only after confirmation
```

OpenAI is used only for draft creation in Telegram Phase 1.

Do not implement freeform calendar Q&A in Phase 1.

### 12.4 Telegram Phase 2 — conversational assistant

Deferred to later:

- freeform Q&A about calendar,
- “what do I have tonight?”,
- “when is my dentist appointment?”,
- natural language calendar search,
- moving/editing/deleting items by natural language,
- mark done from Telegram,
- richer multi-step assistant behavior,
- production webhook,
- Vercel Cron morning digest,
- reminders before items.

### 12.5 Local vs production Telegram mode

Local development:

```text
TELEGRAM_MODE=polling
pnpm telegram:dev
```

Production later:

```text
TELEGRAM_MODE=webhook
/api/telegram/webhook
```

Do not try to run polling and webhook at the same time for the same bot.

---

## 13) Canvas roadmap

Canvas is a future major tab.

Preferred direction:

- freeform writing anywhere,
- draggable text blocks,
- drawing/sketching,
- checklists inside canvas,
- persistent boards,
- Apple Freeform / Apple Notes energy, but personal and pragmatic.

Canvas comes after Telegram/reminders or after fun features depending on current priority.

Do not implement Canvas until explicitly requested.

---

## 14) Reminders and digest roadmap

Planned reminder/digest features:

- Telegram morning digest,
- possibly email digest later,
- today’s items,
- overdue unfinished untimed items,
- reminders before specific timed items,
- Vercel Cron in production,
- local manual script during development.

Telegram is preferred before email because it is easier to test and more useful interactively.

---

## 15) Local development workflow

Current preferred workflow:

1. Work locally in the local project environment.
2. Use pnpm.
3. Test locally.
4. Push local changes to GitHub using GitHub Desktop or git.
5. Let Vercel deploy from GitHub.

### 15.1 Local env

Local env can be `.env` or `.env.local`.

Rules:

- do not commit env files,
- do not log secrets,
- Vercel env vars are configured separately in Vercel UI,
- GitHub secrets are only needed for GitHub Actions/CI.

### 15.2 Commands

Common commands:

```bash
pnpm dev
pnpm lint
pnpm build
```

Telegram local future commands:

```bash
pnpm telegram:dev
pnpm telegram:digest
```

---

## 16) Deployment and database discipline

We had database drift problems before. Do not repeat them.

### 16.1 Vercel build rule

Do **not** run migrations or schema push inside Vercel build.

Vercel build should remain ordinary app build:

```text
next build
```

Do not reintroduce:

```text
pnpm db:migrate && next build
pnpm db:push && next build
vercel-build migration hook
```

### 16.2 Schema changes

If schema changes are necessary:

- update schema files,
- update validation/types/data mapping,
- update lockfile if dependencies changed,
- apply schema intentionally from local dev or agreed migration workflow,
- verify actual DB schema matches code,
- do not assume migration applied automatically.

Current practical mode has used Drizzle schema push locally.

Future preferred discipline:

- formal Drizzle migrations or a clearly defined `db:push`/migration workflow,
- no hidden production schema changes during build,
- no code that references columns before DB has them.

### 16.3 Lockfile discipline

If package versions change:

- update `package.json`,
- run `pnpm install`,
- commit `pnpm-lock.yaml`,
- ensure Vercel frozen lockfile install will pass.

---

## 17) Agent operating rules

Any coding agent must follow these rules.

### 17.1 Inspect first

Before changing code:

- inspect current files,
- understand current architecture,
- identify source-of-truth helpers,
- check existing data/save flows,
- avoid duplicating logic blindly.

### 17.2 Scope discipline

Do only the requested phase/task.

Do not quietly start:

- framework migrations,
- deployment rewrites,
- schema rewrites,
- unrelated UI redesign,
- AI provider swaps,
- new features outside the prompt.

### 17.3 No pretty-but-broken work

If a UI control changes something, it must persist when persistence is expected.

Verify:

```text
create → edit → save → refresh → navigate away/back → still correct
```

Applies especially to:

- custom colors,
- item order,
- done state,
- recurrence edits,
- AI draft consumption,
- Telegram confirmed drafts.

### 17.4 No technical leakage

Do not show internal implementation details in UI:

- no `Edited` badge,
- no raw override labels,
- no parent/occurrence technical state,
- no task/event split,
- no AM/PM.

### 17.5 Single source of truth

Use existing shared helpers for:

- date formatting,
- time formatting,
- recurrence expansion,
- item sorting,
- AI draft normalization,
- calendar queries.

If a helper is too UI-coupled, create a shared server-side helper rather than copy-pasting fragile logic.

### 17.6 Security

- Do not hardcode secrets.
- Do not commit `.env` files.
- Do not log tokens.
- Telegram bot must check `TELEGRAM_ALLOWED_CHAT_ID` before exposing calendar data.
- OpenAI calls happen server-side/local-script-side only.

---

## 18) Required validation before finishing any task

At minimum:

```bash
pnpm lint
pnpm build
```

For UI tasks, manually verify relevant flows.

For persistence tasks, verify after refresh.

For recurrence tasks, verify:

- base occurrence,
- later occurrences,
- edit occurrence,
- edit series,
- delete occurrence,
- delete series,
- exdates,
- overrides.

For AI tasks, verify:

- draft creation,
- edit draft,
- save draft,
- pending draft disappears,
- no duplicate item.

For Telegram tasks, verify:

- allowed chat protection,
- `/start`, `/help`, `/today`, `/tomorrow`, `/week`,
- natural text → draft,
- confirm/cancel,
- digest script,
- polling does not process duplicates.

---

## 19) Current roadmap

### Immediate / near-term

1. Fix recurrence inclusive first occurrence bug if not already fixed.
2. Telegram Phase 1 local polling:
   - commands,
   - AI drafts,
   - confirm/cancel,
   - digest script.
3. Telegram production mode later:
   - webhook,
   - Vercel Cron,
   - morning digest.

### Medium-term

4. Telegram Phase 2 conversational assistant:
   - freeform Q&A,
   - calendar search,
   - edit/move/mark done via Telegram.
5. Reminders:
   - daily digest,
   - item reminders,
   - overdue items.
6. Canvas tab:
   - freeform canvas,
   - drawing,
   - draggable text,
   - checklists.

### Fun / side features

7. Casino/Gambling polish if desired:
   - more animations,
   - richer payout presentation,
   - optional local milestones.

---

## 20) Definition of done for the current product baseline

The app baseline is healthy when:

1. Calendar loads at production domain.
2. Monthly grid works.
3. Selected-day panel works.
4. Unified Item UI has no visible task/event split.
5. Manual add/edit/delete works.
6. Done persists.
7. Custom color persists.
8. Untimed DnD order persists.
9. Recurrence works, including first occurrence inclusion.
10. Recurrence edit/delete occurrence and series work.
11. AI drafts work and require confirmation.
12. Saved AI drafts do not remain pending.
13. Gambling tab works and does not affect calendar.
14. Local Telegram bot Phase 1 works when implemented.
15. No secrets are committed.
16. `pnpm lint` passes.
17. `pnpm build` passes.

---

## 21) Final instruction for agents

This app is a personal external brain.

Build pragmatically. Make it beautiful, fast, and stable.

Do not make it clever in ways that create fragility.

When in doubt:

- preserve existing working behavior,
- keep the user-facing model simple,
- avoid hidden state tricks,
- make persistence real,
- keep recurrence safe,
- keep AI draft confirmation safe,
- keep Telegram security strict,
- ship small coherent phases instead of giant chaotic rewrites.
