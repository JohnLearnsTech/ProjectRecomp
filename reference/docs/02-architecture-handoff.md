# Architecture handoff

For the architect rebuilding Recomp as a native iOS and Android app for a small friends-and-family test. Read `01-product-brief.md` first. The data model is in `03-data-model.md` and `schemas/`, behaviour in `05-business-logic.md`, design in `04-design-guidelines.md` and `design/tokens.json`, and the built-in content is in `seed/`.

## 1. The reference implementation

`app/recomp.html` is the complete working app: one file of about 640 KB holding HTML, CSS and roughly 7,000 lines of JavaScript in a single closure. It began life as a Claude artifact on claude.ai and uses three host capabilities through `window.claude.use(...)`:

| Capability | Used for | Standalone behaviour |
|---|---|---|
| `db` | A Firestore-like document store: `state/*`, `log/<date>`, `reviews/<id>` | Off. Falls back to `localStorage` ("this device only") |
| `sample` | Claude calls: food estimates, label scan, plate photo, weekly review, plan builder | Off. Those buttons say Claude is not reachable |
| `mcp` (Google Calendar) | Reminders as calendar events | Off |
| `downloads` | Backup and CSV export files | Falls back to a browser download |

Treat the HTML as the **behavioural spec**, not code to port line by line. Open it in any browser, run the setup, and use it for a few days. Everything described in the docs can be seen there.

## 2. Recommended stack for the test build

Each choice below is aimed at the fewest moving parts that still give real accounts, sync, notifications and Claude.

| Layer | Recommendation | Why |
|---|---|---|
| App | **Expo (React Native) + TypeScript** | One codebase for iOS and Android, over-the-air updates during the test, and simple TestFlight and Play internal-testing builds with EAS |
| Navigation | Expo Router, bottom tabs (Today, Food, +, Train, Progress) and a stack for Me and session mode | Matches the information architecture in the design guidelines |
| Local store | SQLite (expo-sqlite) with a sync queue | Offline-first; logging must work on a plane |
| Backend | **Supabase** (Postgres, Auth, Row Level Security, Edge Functions, Storage) | Relational model fits the data, RLS gives per-user isolation, and Edge Functions host the Claude proxy |
| Auth | Email magic link plus Sign in with Apple and Google | Low friction for friends |
| AI | **Claude API through a server-side proxy** (Supabase Edge Function) | The API key never ships in the app. The proxy also handles rate limits per user and logging |
| Notifications | expo-notifications (local) for reminders, rest timer and habit timers | Replaces Google Calendar for the test |
| Health | Apple HealthKit and Android Health Connect for steps (and optionally weight and sleep) | Removes manual step entry |
| Camera | expo-camera / image-picker for label and plate photos | Sent to the proxy as base64 images |
| Analytics and crashes | Sentry (crashes) and PostHog or Supabase logs (events) | Needed to judge the test |

A Firebase/Firestore backend would also work, and is closer to today's document shape. If you choose it, keep the lessons in section 6, especially the nested-array rule.

## 3. Mapping the web app to the native app

| Web app piece | Native replacement |
|---|---|
| `localStorage` `goa:*` keys and the `db` docs | SQLite tables mirroring the recommended schema in `03-data-model.md`, synced to Postgres |
| `log/<YYYY-MM-DD>` day documents | `day_logs` plus child tables (`food_entries`, `set_entries`, `habit_logs`, `habit_sessions`). Keep the date as the user's **local** calendar date string, not a UTC timestamp |
| `state/plan` (phases with nested weeks) | `plans`, `plan_phases`, `plan_slots`, `programs`, `program_exercises` |
| `window.claude.use("sample")` | Proxy endpoints `/estimate-food`, `/scan-label`, `/scan-plate`, `/weekly-review`, `/build-plan` (section 4) |
| Google Calendar reminders | Local scheduled notifications. Calendar export can come back later |
| Wake lock during timers | `expo-keep-awake` while a session or focus timer is open |
| Rest timer chime with the screen locked | A local notification scheduled for the rest end time. **Don't rely on JS timers in the background** |
| Backup, restore and CSV | Server-side export and a "download my data" screen. Accept the web app's backup JSON on import (`03-data-model.md`, migration section) so the owner can move over |
| YouTube form search | Open `https://www.youtube.com/results?search_query=<exercise> exercise form` with expo-web-browser |

## 4. Claude integration

All Claude calls go through the proxy. The exact prompts the web app sends, and the JSON each expects back, are quoted in `05-business-logic.md` (AI section). Keep the prompts and the response shapes, and move them server-side.

**Model.** Use `claude-opus-5-5` for every endpoint, with adaptive thinking (the default on this model; don't send `budget_tokens`). Set `output_config.effort` per endpoint. On this model the default effort is `medium`, so set it explicitly:

| Endpoint | Input | Output | Effort | Notes |
|---|---|---|---|---|
| `/estimate-food` | List of food descriptions plus the profile cuisine | JSON array: `name`, `serving_g`, `per100 {kcal,p,c,f,fib}` | `low` | Highest volume. The app scales by grams or counts and caches per 100 g, so Claude never returns portion totals |
| `/scan-label` | Image of a nutrition panel | JSON per-100 g panel plus serving size | `low` | Base64 image content block |
| `/scan-plate` | Image of a plate plus an optional note | JSON items with grams and per-100 g values | `medium` | The user confirms grams before logging |
| `/weekly-review` | Last 14 days summarised server-side, plus targets and rules | JSON: a summary and at most ONE proposed change | `medium` | Enforce the safety rules server-side, not just in the prompt (below) |
| `/build-plan` | Profile, goal, rules and the current plan | A plan JSON matching `schemas/plan.schema.json` | `high` | Validate against the schema and reject anything that fails. The web app's `normPlan` shows the checks |

The owner chose to use Claude for this app. Moving the high-volume food endpoint to a cheaper model is the owner's cost decision to make after measuring quality on real entries; don't make it silently.

**Request shape:**
- Use the official Anthropic SDK in the Edge Function (TypeScript: `@anthropic-ai/sdk`).
- Use structured outputs (`output_config.format` with a JSON schema) for every JSON endpoint, instead of asking for "JSON only" in the prompt.
- Put the stable instructions in the system prompt with prompt caching (`cache_control`). Put the per-request data in the user message.
- Images go in as `{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":...}}`. Downscale to about 1,600 px on the long edge on the phone first.
- Always check `stop_reason` before reading content, including `refusal`. Enable the server-side refusal fallback (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta), and show a friendly "couldn't estimate that, edit it by hand" message when it still fails.

**Safety rules the server must enforce** (these are already rules in the app):
- Never set calories below the user's floor (`kcalFloor`), and never cut protein.
- Change at most one thing per weekly review, and nothing changes until the user taps Apply.
- Claude never edits medicines, user checks or anything under health notes.
- The user's free-text "rules" from About you, such as "no deadlifts until under 130 kg" or "no sauna", are passed to every plan and review call, and plans that break them are rejected.

**Privacy:** Profiles can hold medicines and medical conditions. Send Claude only what each endpoint needs, never log full prompts with health data in plain text, and say clearly in onboarding that descriptions and photos are sent to Anthropic for estimates.

## 5. Sync rules (non-negotiable)

These rules each fix a real bug that lost data in the web app:

1. **Never delete a local record just because the server doesn't have it.** Treat it as unsynced and upload it. Only a record the server once held and later removed counts as deleted.
2. **Saves are bound to the record that was edited.** A debounced save or an async Claude result writes to the day and row it started with, never to "whatever is on screen now".
3. **Async results must reference rows by id, not by position.** A row deleted while Claude is answering is skipped.
4. **Last write wins per field, not per day.** The web app writes whole day documents. The native app should write rows (a food entry, a set) so two devices don't overwrite each other's day.
5. **Dates are local calendar dates.** Store `YYYY-MM-DD` in the user's timezone, and handle a day rolling over while the app is open.

## 6. Lessons learned (do not reintroduce)

| Bug in the web app | Lesson |
|---|---|
| Records read from the host store were frozen, so writing to them threw and silently broke Save | Never mutate data straight from a store or an API response. Copy it first |
| The host store refused arrays inside arrays (weeks of days) | Model nested lists as child tables or objects |
| Two calendars (goal start and training-block start) were mixed in several places, so stats showed the wrong day | Name both explicitly (`goalDayIndex`, `trainingDayIndex`) and test a goal whose block was restarted |
| A modal backdrop showed without its sheet, dimming the app until reload | A backdrop belongs to its sheet component. Never render it separately |
| Cached food estimates ignored counts ("4 rotis" = 1 roti) | Cache per unit or per 100 g, and multiply by the parsed amount every time |
| "Boneless" was treated as a filler word | Modifiers that change nutrition (boneless, bone-in, skin-on, fried) must count when matching |
| A dish with ingredients was split into separate rows on its commas | Detect a dish-with-ingredients and keep it as one entry priced as a whole |
| The waist reminder followed the training week, not the calendar | Calendar habits (weekly weigh-ins, photos) attach to weekdays, not plan days |
| Limit habits showed a tick before the day was over | A limit is only "met" once the day ends |

## 7. Test distribution

1. **iOS:** an EAS build uploaded to TestFlight, internal testers by email (up to 100, no review), or external testers after a short beta review.
2. **Android:** an EAS build to Play Console **internal testing** (up to 100 testers by email list, no review).
3. **Over-the-air updates** (EAS Update) for JavaScript-only fixes during the test.
4. **Feedback:** an in-app "Send feedback" item under Me that attaches the app version and the last 50 log lines (no health data) and opens an email or form.
5. **Version stamp:** show the build version under Me > Settings, as the web app does. It made remote debugging possible.

## 8. Suggested milestones

| Week | Deliverable |
|---|---|
| 1 | Auth, local DB, schema and sync skeleton. Onboarding, targets and default plan from `seed/default-plans.json` logic |
| 2 | Today and Food: built-in table matching, manual entry, food table, quick log, the `/estimate-food` proxy |
| 3 | Train: plan view, set logging, session mode with rest-timer notifications, swaps |
| 4 | Habits with timers, keystone and streaks; Consistency; Progress charts and projection |
| 5 | Weekly review, plan builder, label and plate scans, HealthKit and Health Connect steps |
| 6 | Import from the web backup, polish, TestFlight and Play internal release |

## 9. Acceptance checks before inviting friends

- Every rule in sections 5 and 6 has an automated test.
- Log a meal in airplane mode, kill the app, reopen it online on a second device, and the meal appears on both.
- Restart a training block mid-goal: "Day N of total", the on-plan target and Consistency must all still be correct.
- Run the food pipeline against the cases in `05-business-logic.md`: "4 rotis", "boneless chicken biryani", "chicken salad with lettuce, capsicum, 20 g caesar dressing", "2 eggs. 1 apple" and "1.5 rotis".
- Run every screen in light and dark mode against the screenshots, with 44 px touch targets and contrast checked.
