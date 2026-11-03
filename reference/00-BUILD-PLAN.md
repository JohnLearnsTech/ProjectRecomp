# Recomp Android build: decisions and current state

Read this before `README.md`. It records what the owner decided after the handoff package was written, and what changed in the app since then.

## What we're building

A native version of the owner's existing Recomp web app (`app/recomp.html`, version **2026-11-03 r19**), with the same screens and behaviour, for the owner and a small group of friends on Android. It is **not** a new or generic fitness app. The data model is in `docs/03-data-model.md` and `schemas/`, and the rules are in `docs/05-business-logic.md`. Open `app/recomp.html` in a browser to see every screen working.

## Decisions (owner, 3 Nov 2026)

| Topic | Decision |
|---|---|
| Stack | Expo (React Native) + TypeScript, with Supabase for Postgres, Auth, RLS and Edge Functions. Android first; iOS later |
| Cost to the owner | **Zero.** The owner pays for nobody's AI use. Supabase free tier only. **No server-side Anthropic key** |
| AI option 1 (default for friends) | A **Recomp MCP connector** (a Supabase Edge Function using Supabase Auth via OAuth). Each friend adds it in their own Claude app (Settings, Connectors) and uses their own Claude subscription. Claude reads and writes only that friend's rows |
| AI option 2 (optional) | **Bring your own API key** in Me, Settings, AI. The key stays in the phone's secure storage and is sent only to Anthropic, never to Supabase. All in-app AI features work when a key is set |
| Food without a key | Built-in table matches fill in instantly. Anything else is saved as a row tagged `needs_estimate`, so it appears in the log right away |
| "Estimate with Claude" button | Opens the Claude app with a prefilled message ("Estimate my pending Recomp foods"). Claude, through the connector, fills **every** pending row in one go. Fallback: Android share sheet to Claude. Test whether the Claude Android app accepts a prefilled message |
| Learning | Every Claude estimate is saved to that user's personal food list (`myFoods` in the profile), so the same food is instant next time |
| Connector tools needed (first cut) | `list_pending_foods`, `set_food_estimate`, `log_food`, `get_day`, `get_week_summary`, `log_weight` / `log_steps` / `log_sleep`, `get_plan`, `propose_plan_change` (stored for the user to Apply in the app; never auto-applied), `save_weekly_review` |
| Safety rules | Same as `docs/02-architecture-handoff.md` section 4, enforced in the Edge Function: never below the calorie floor, never cut protein, one change per review, never touch medicines or health notes |
| Migration | Owner imports the web app's backup JSON (`docs/03-data-model.md`, migration section) |

## Changes in the app since the docs were written (r16 to r19)

The docs describe r15. `app/recomp.html` is r19. Where they disagree, the app wins:

- **Me** is split into tabs: Plan, Targets, Goal, About you, Notes, Reminders, Backup, Settings. "Ask Claude to change it" on the Plan tab sends the request to the plan builder and shows the proposed plan to Apply.
- **Progress** has sticky quick links to each section.
- **Colour:** a palette switcher (Multi as default, plus Lime, Cobalt, Violet, Ember, Graphite). Multi gives each category its own colour: move, food, protein, train, habit, body. Tokens are `--c-<category>`, `-on`, `-ink`, `-soft`. `design/tokens.json` holds only the old lime set.
- **Weekly review** is now a blunt coach: grade A to F, a headline, 3 to 5 truths, the biggest leak, 3 commitments, at most 2 wins, and one suggestion `{what, why, change}`. It still never shames food or body, never goes below the floor, and never suggests skipping meals or training through pain. A client-side scorecard sits beside it: sessions, protein-floor days, calories, food days, step days, sleep, weigh-ins and habits.
- **Walk timer:** "Stop & log" asks for the walk's steps and adds them to the day.
- **Food pipeline:**
  - A dish only absorbs the ingredients on its own line. A new line or a ". " starts a new entry. Brackets keep items together.
  - The estimate cache key keeps numbers that aren't at the start ("chicken 65") and "boneless".
  - User foods in `myFoods` are matched before the built-in table, with the format `{n, k:[keywords], per:"100g"|"unit", g, v:[kcal,p,c,f,fib]}`.

## Build order

1. Sign-in and storage on the **real** schema in `docs/03-data-model.md`: profile, plan, day logs with food, sets, habits and sessions.
2. Today and Food screens. Built-in food matching, using `seed/foods.json`.
3. Train and session mode.
4. Habits, Consistency and Progress.
5. Settings, AI: bring your own key, and port the prompts from `docs/05-business-logic.md`.
6. The MCP connector Edge Function, plus the "Estimate with Claude" handoff.
7. Backup import, then an APK build with EAS for testers.
