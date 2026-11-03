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

## Next (build plan step 2)

Port the domain module (`plan(k)`, `normPlan`, default plans, `canonName`, food matching) from `recomp.html` into `app/src/domain/`, load the font and Multi palette, then Today and Food screens with `reference/seed/foods.json`.
