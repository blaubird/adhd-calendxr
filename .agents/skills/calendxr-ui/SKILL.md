---
name: calendxr-ui
description: Use for CALENDXR web UI and visual polish work: Calendar layout, Canvas chrome, Gambling layout, dark glass design, typography, spacing, responsive behavior.
---

# CALENDXR UI

Use this skill for web UI and visual polish work: Calendar layout, Canvas chrome, Gambling layout, dark glass design, typography, spacing, responsive behavior, and interaction polish.

## Visual Direction

The app should feel:

- Dark.
- Cold.
- Black-heavy.
- Subtle glass.
- Premium.
- Command-center.
- Slightly futuristic.

Avoid:

- Giant chunky UI.
- Too much brightness.
- Childish colors.
- Neon overload.
- Random font-size chaos.
- Global `transform: scale()`.
- Mobile-like oversized desktop UI.

## UI Scale And Typography

- Keep desktop UI dense enough for repeated productivity use.
- Use consistent type sizes and spacing.
- Avoid fixing layout issues with global scaling.
- Make text fit its containers at desktop and mobile widths.
- Prefer existing components, styles, and layout patterns.

## Business Logic Boundary

- UI polish should not change Calendar, Telegram, Canvas, Gambling, auth, API, or database behavior unless explicitly requested.
- Keep visual patches separate from data model and routing changes.
- If a visual task reveals a logic bug, report it and keep the fix scoped.

## Postponed Roadmap

Future visual/metaprogression ideas are postponed unless explicitly requested:

- Richer UI and stronger realistic glass textures.
- Smoother or more complex animations.
- Changeable backgrounds.
- Customizable accent colors.
- Moon skins/details.
- Unlockable cosmetics.
- Backgrounds and moon skins purchasable with Gambling points.
- Achievements that reward points.

## Validation Checklist

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.
- Inspect desktop and mobile responsive behavior when feasible.
- Check text overflow, overlapping UI, and layout shift.
- Confirm no unrelated app behavior changed.
