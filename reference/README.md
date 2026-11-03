# Recomp: mobile app handoff package

Everything needed to rebuild Recomp, a training, food and habits app, as a native iOS and Android app for a friends-and-family test.

Source version: app file **2026-11-03 r19** (docs written against r15; see `00-BUILD-PLAN.md` for what changed) (shown in the app under Me > Settings). Package date: 16 Oct 2026.

## Start here

1. Open `app/recomp.html` in a phone or desktop browser and run the setup. It is the full working app, and the behaviour reference for everything below.
2. Read `docs/01-product-brief.md` (what and who) and `docs/02-architecture-handoff.md` (stack, Claude integration, sync rules, test distribution).
3. Build against `docs/03-data-model.md` with `schemas/`, `docs/05-business-logic.md`, and `docs/04-design-guidelines.md` with `design/tokens.json`.

## Contents

| Path | What it is |
|---|---|
| `app/recomp.html` | The complete web app as one standalone HTML file. Outside claude.ai it runs in "this device only" mode: data stays in the browser's localStorage, and the Claude and Google Calendar features are off |
| `app/index.html`, `manifest.webmanifest`, `icon*.png`, `icon.svg` | Lets the web app be served from any static host and added to a phone home screen |
| `docs/01-product-brief.md` | Product, users, core loop, feature inventory, test goals, scope |
| `docs/02-architecture-handoff.md` | Recommended stack, how each web-only piece is replaced, Claude endpoints and safety rules, sync rules, lessons learned, distribution, milestones, acceptance checks |
| `docs/03-data-model.md` | Every stored entity and field, where it lives today, the recommended cloud schema, and migration from the web app |
| `schemas/*.schema.json`, `schemas/examples/` | JSON Schema for each core entity, with fictional examples |
| `docs/04-design-guidelines.md` | Principles, colour, type, layout, navigation, screen-by-screen order, components, motion, writing, and the owner's design decisions |
| `design/tokens.json` | Colour (light and dark), type scale, spacing, radius, shadow and motion tokens |
| `docs/05-business-logic.md` | Formulas and rules: calendars, targets, plan engine, projection, the food pipeline, habits, streaks, session mode, the exact Claude prompts, reminders, sync, and gotchas |
| `seed/foods.json` | The built-in food table (74 foods, per 100 g or per unit, matching keywords) |
| `seed/exercises.json` | Session programs with cues, warm-up and stretch lists, and the exercise swap pools |
| `seed/default-plans.json` | The default 4-phase plans the app generates for each setup (gym 3 or 4 days, home, no equipment, home-first) |
| `seed/quotes.json`, `seed/habits.json`, `seed/app-copy.json` | Attributed quotes, habit templates and units, and fixed plan copy |
| `screenshots/` | Every main screen in light and dark mode, plus setup, session mode and the quick-log sheet, with a fictional demo user |

## Privacy

This package contains **no real user data**. The app file holds no personal details, and the screenshots and schema examples use a fictional user ("Alex"). The owner's real data stays in their claude.ai artifact; moving it into the new app is a separate, owner-run import (see the migration section in `docs/03-data-model.md`).

## Notes on the screenshots

They are full-page captures, so the floating bottom tab bar appears part-way down the longer screens. On a phone it stays pinned to the bottom of the screen.

## Known issues to fix in the rebuild

`docs/05-business-logic.md` ends with a "Possible bugs" list (24 items), and `docs/03-data-model.md` lists 20 ambiguities. Both were written against r14. Two items are already fixed in this package's r15 build:

- Hard-coded text from the owner's own goal ("of 117", "Outside the 117-day window", "The plan starts on 7 September", "Measured every Monday") now uses each user's own goal dates and waist day.
- "Start the next goal" now matches the real goal types (lose, muscle, recomp, health). The `gain` and `maintain` values the doc mentions don't exist.

Everything else on those lists is still open and worth fixing in the native app, not copying across.
