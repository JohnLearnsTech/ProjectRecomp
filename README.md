# Recomp

Native Android port of the Recomp web app (`reference/app/recomp.html`, r19). Expo + Supabase.
Start with `reference/00-BUILD-PLAN.md` for owner decisions and build order.

## Layout

- `reference/`: the web app, handoff docs, schemas, seed data, screenshots. Where docs and app disagree, the app wins.
- `app/`: Expo SDK 58 (Expo Router) app. Package `com.johnlearnstech.recomp`, scheme `recomp://`.
- `supabase/migrations/`: SQL applied to project `qykmzaftzklqsttdezre` (ap-northeast-1).

## Build step 1: sign-in and storage (done)

**Schema** (`0001_init.sql`) follows `reference/docs/03-data-model.md` section 16: profiles, notes, weight history, personal foods, goals and milestones, versioned plans, plan proposals, swaps, day logs, food entries, set entries, habits, habit logs and sessions, user checks, hidden checks, check ticks, per-user and global food caches, saved meals, reviews, reminders and legacy calendar events. Deliberate differences from the doc:

- Plans store the r19 Plan object as `jsonb` (`plans.body`), not five normalized tables. Every writer, including the connector's `propose_plan_change`, handles whole plans and `normPlan` validates the whole object, so splitting it only adds join and write code. Saved-meal rows are `jsonb` for the same reason.
- `plan_proposals` holds Claude's proposed plan changes until the user taps Apply. Never auto-applied.
- `food_entries.needs_estimate` is a generated column implementing r19's needsNumbers rule. The connector's `list_pending_foods` reads it.
- Day child tables (food, sets, habits, ticks) have no hard FK to `day_logs`, so rows can arrive in any order. A trigger keeps `day_logs.kcal_total`/`protein_total_g` equal to the food rows and creates the day row as needed.
- No `deleted_at` yet. Add it with offline sync.

**Security**: owner-only RLS on every user table; `food_cache_global` is read-only to clients. Tested with throwaway users: cross-user reads, forged `user_id`, cross-user updates and FK attachment are rejected; account deletion removes every row.

**Auth**: passwordless email (`signInWithOtp`, PKCE). The link opens `recomp://auth/callback?code=…`. A 6-digit code field is ready for when custom SMTP lets the template include `{{ .Token }}`.

**App**: sign-in, Today quick log (weight, steps, sleep, waist on the waist weekday), Me with About you and Settings > AI (bring-your-own Anthropic key in SecureStore, never sent to Supabase). `src/lib/db.ts` is the typed data layer for day logs, food, sets, habits and checks, tested against the live project.

## Run

```bash
cd app && npm install && npx expo start
```

All native modules used ship in Expo Go (the `exp://` redirect is allow-listed). APK for testers:

```bash
cd app && npx eas-cli@latest init && npx eas-cli@latest build -p android --profile preview
```

`app/.env` holds only the Supabase URL and publishable key, which are public by design.

## Before inviting friends

Set up custom SMTP (e.g. Resend free tier) in Supabase Auth. The built-in sender allows only a few emails per hour project-wide, and free-tier projects can't edit email templates without it.

## Build step 2: Today and Food (done)

**Domain module** (`app/src/domain/`): a TypeScript port of r19's plan engine (`phaseBounds`, timelines, `makePlan`, `homeFirstPlan`, `normPlan`, `plan(k)`, `checkList`, floors, weight projection) and food pipeline (`splitItems`, `joinDish`, `parseItem`, `matchFood`, `fromEntry`, `canonName`, `portionOf`, `scaleEst`, meal grouping). The web app keeps these in globals; here `makeEngine(goal, profile, savedPlan)` takes them explicitly. Data tables (74 foods, programs, quotes, warm-ups) are extracted from `recomp.html` by `scripts/extract-r19-data.mjs`, because `reference/seed/foods.json` is the older r15 table and the app wins.

**Parity test** (`npm test` in `app/`): runs the web app's own functions, pulled from `recomp.html`, beside the port on the same inputs. It covers 60 phase lengths, over 16,000 plan days across goal and profile combinations, plan validation on mangled input, and a corpus of about 185 food phrases. Deliberate mutations to the port make it fail.

**Screens** (`docs/step2/` has screenshots):
- Bottom bar (Today, Food, black +, Train, Progress) with the Multi palette and Jost. Me opens from the avatar.
- Header with days to the goal, the day line and a swipeable week strip. Dots score workout and food; habits join in step 4.
- Today: hero card (day and phase, session, Start session, kcal left, protein to go, steps of target), quote card with goal ring and "your own evidence" chips.
- Quick-log sheet from +: weight, steps, sleep, waist on the waist weekday.
- Food: text entry through the r19 pipeline, one-tap saved and recent meals, calorie and protein bars, macro line, the food table grouped by meal with subtotals, row editing, Save meal, and the calories-vs-target chart (calories, protein, carbs, fat, fiber over 1W, 1M, 3M or the goal).

**Food without a key**: your foods and the built-in table fill in at once, then your earlier corrections (`food_cache_user`) and the shared cache. Anything else is saved with no numbers (`needs_estimate`) and shown as "no numbers". Editing a row's numbers marks it "yours" and remembers it per 100 g (or per piece with no weight), so the same food fills in next time.

Train and Progress are placeholders until steps 3 and 4.

## Setup (onboarding, done)

r19's wizard: a hero, then About you, Goal, Training, Life and a summary with calories, protein and steps from `calcTargets` (Mifflin-St Jeor, ported and covered by the parity test across more than 5,000 inputs). It opens on its own when an account has no goal; Me has "Run setup again", which starts at step 1 and can be closed. Screenshots in `docs/onboarding/`.

Finishing calls `finish_onboarding` (`supabase/migrations/0002_onboarding.sql`), one transaction that closes the active goal at its latest weigh-in, creates the new goal, updates the profile, adds r19's seed habits on a first run plus up to three picks that aren't already there, logs today's weight unless one exists, and returns the plan to the default. Tested live: first run, a re-run, isolation between users, anonymous calls refused, and an invalid setup rolling back completely. The same migration raises the goal calorie cap to 12,000, because `calcTargets` can exceed 6,000 for very large "build muscle" users that r19 accepts.

With no active goal the app now uses the most recent goal, as r19's `activeGoal()` does, instead of the starter goal.

## Known gaps

- The food guides (Protein first, Eating out, ...) and the 7-day average line on the chart are not ported yet.
- "Estimate with Claude" waits for the connector (step 6) or a pasted key (step 5).

## Next (build plan step 3)

Train and session mode: exercise list with set grids, swaps, progression hints, rest timer, using `set_entries`.
