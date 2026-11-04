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

## Build step 3: Train and session mode (done)

**Domain** (`app/src/domain/training.ts`): r19's exercise swaps (`resolveLine` with the `EXGROUP`/`ALTPOOL` tables, extracted from `recomp.html`), load kinds, rep schemes, last time, the progression hint, session-mode suggestions (double progression), bests, load volume and the same-session comparison. The parity test runs these against r19 on random set histories across five equipment and day setups, swaps included. Deliberate mutations (kg step, phase rule, band volume, date boundary) all fail it.

**Train**: session card with Start, Resume or Continue in session mode; warm-up and stretch blocks behind a remembered toggle; one line per exercise until tapped, then last time with the progression hint, the cue, swaps (same scheme, own history), the set grid (kg or band, then reps or seconds, + and − set) and a YouTube link. Reps entered on a set with no load copy the nearest earlier load, visibly, as r19 does. Then load volume against the last same session, session note, after-session cardio, steps, and band setup (names and kg, lightest first) when the session uses bands. A day stepper browses other days.

**Session mode** (`/session`, full screen, keeps the screen awake): per-exercise progress bar, last time, the suggestion, how-to, set chips, steppers (kg step 5 for squat-pattern lifts, else 2.5), Log or Update set, new-best detection with a buzz, rest timer (60/90/120/180 s, +15 s, Skip; buzzes when it runs out), Back and Next. The summary shows time, sets, exercises, volume against the last same session and new bests; Save and close ticks the day as trained. Session state and rest length stay on the device (`goa:wo`, `goa:rest`), so minimising keeps the session.

Tested in the browser on a seeded account: grid edits and the load carry saved correctly, the phase-1 suggestion and last time matched r19, both new bests were detected, volume (1,625 kg, up 18% on 1,380 kg) matched a hand calculation, and Save and close wrote the train tick that Today then shows. Screenshots in `docs/step3/`.

## Build step 4: habits, Consistency and Progress (done)

**Domain** (`app/src/domain/days.ts`): r19's habit maths (streak, longest, strength, completion %, habits hit), the consistency engine (day state, session streaks, item states, day score, dot state, the missed-session nudge) and the weight series, 7-day average, projection, 28-day trend, stats and per-exercise load volume. All of it reads one `entries` map in r19's own day shape, built from the database for the goal window (`lib/days.ts`, one shared provider). The parity test runs r19's functions on random 12-week histories with gaps, varied habit types and eight "today" dates, plus boundary cases for the trend and the average; eight deliberate mutations all fail it.

**Today**: the missed-session nudge (hide until tomorrow), habit cards (timer ring or %, keystone star, 7-day dots, status line), the running-timer hero (session time or time left, Pause, Stop & log), a walk's steps prompt after Stop, Pomodoro (focus and break lengths, target habit, logs finished blocks), the habit sheet (stepper in the habit's step, 5-minute notches for hour habits, steps for walk habits, reset, sessions with delete, 14-day bars, strength, goal, keystone, reorder, remove) and an add-habit form with r19's units. Then the four-week Consistency card, which opens the calendar on Progress. The week strip now scores every habit, and the quick-log sheet lists habit chips. Removing a habit archives it, so history keeps its name. Timers and Pomodoro stay on the device; stopped time goes to the timer's own day, with its sessions.

**Progress**: weight vs plan (or waist) over 1W, 1M, 3M or the goal with the dashed projection and the landing range; the six stats (latest, 7-day average, change, on-plan target with the ahead/behind verdict, current-rate projection with ETA, days logged); "What you measured" for the browsed day; full Consistency (six stats, Overall or per-item filter, swipeable month calendar, legend, the selected day item by item, Open this day); load volume per exercise; the daily log for the last 14 days. Screenshots in `docs/step4/`.

## Known gaps

- **Weekly review** waits for Claude (step 5); Progress shows where it will go. Its client-side scorecard comes with it.
- Earlier weigh-ins (`weight_history`, r19's faded line before the start) have no editor yet, so the chart doesn't draw them.
- Habit timers don't alert in the background; same notification gap as the rest timer.

- **Rest alerts only while session mode is open.** r19 shows a toast when minimised; a phone app needs a local notification for that (and for a locked screen), which comes with reminders (expo-notifications).
- No chime sound yet, only vibration. "Edit plan" and the Train guides (Your sessions, How to progress, ...) are not ported.

- The food guides (Protein first, Eating out, ...) and the 7-day average line on the chart are not ported yet.
- "Estimate with Claude" waits for the connector (step 6) or a pasted key (step 5).

## Next (build plan step 5)

Settings, AI: bring your own key, and port the prompts from `docs/05-business-logic.md` (food estimates, label and plate photos, plan builder, weekly review).
