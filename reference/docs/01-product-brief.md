# Recomp: product brief

## What it is

Recomp is a personal life-change app. It puts training, food, habits, sleep and the plan that ties them together in one place, and uses Claude to fill the gaps a tracker can't: pricing a dish you describe in your own words, reading a nutrition label, reviewing your week, and building a training plan around your constraints.

It is not a calorie counter with extras. The daily question it answers is **"what do I do next?"**, and every screen is built around that.

## Who it is for (first test group)

The owner plus a small group of friends, 5 to 20 people, on iOS and Android. They use it daily, mostly on a phone, often with one hand. They have mixed goals: lose fat, gain muscle, or maintain while building habits. Equipment varies: full gym, home dumbbells and bands, or nothing. The food table and the AI prompts are tuned for Indian food and cuisine, but the app is not limited to it.

## Core loop

1. **Morning:** weigh in (+ button), see today's session and targets on Today.
2. **During the day:** log food in plain words ("2 chapati, 1 katori dal") or with one tap from saved and recent meals. Run habit timers (walk, study, work). Keep limit habits under their caps (social media, gaming).
3. **Training:** start the session, log sets one exercise at a time with a rest timer and suggested loads, and watch a form video if unsure.
4. **Weekly:** read Progress (7-day average against the plan line, consistency, strength), run the weekly review, and let Claude suggest one change.

## Feature inventory

| Area | Features |
|---|---|
| Setup | 6-step onboarding (basics, goal type, equipment and days, lifestyle and habits, plan summary), recalculated targets, can be rerun from Settings |
| Today | Session hero with Start, kcal/protein/steps progress, missed-session nudge, quote card with goal ring and personal evidence, full habit cards with timers, compact 4-week consistency |
| Food | Plain-language logging, a built-in food table (74 entries) with keyword matching, Claude estimates for everything else, dish-with-ingredients kept as one entry, label scan and plate photo, edit and correct (corrections are remembered), saved meals and one-tap logging, macros and fiber, calorie/macro charts |
| Train | 4-phase plan, per-day sessions, set logging (weight, band level or bodyweight), exercise swaps within muscle-group pools, warm-up and stretch, session mode with rest timer, YouTube form search, load-volume chart, band setup |
| Habits | Build habits (hit a goal) and limit habits (stay under a cap), units (minutes and hours with timers, times, steps, glasses, litres, pages, km, grams), keystone habit, 7-day streak dots, Pomodoro focus, full-screen focus mode |
| Progress | Weight and waist vs plan, 7-day average, change, on-plan target, projection at current rate, consistency calendar and stats, daily log, weekly review by Claude |
| Me | Plan editor (phases, targets, sessions), AI plan builder, goal with dates and milestones, About you (used by every Claude call), notes, Google Calendar reminders, backup/restore/CSV export, earlier weigh-ins, theme |

## What the web version cannot do (the reason for a native app)

- **Real accounts and sync between devices.** Today the data lives in a Claude-hosted store tied to one artifact owner, so friends can't have their own accounts.
- **Notifications and alarms.** Reminders go through Google Calendar, and the rest timer can't ring reliably with the screen locked.
- **Health data.** There's no step count from Apple Health or Health Connect, so steps are typed in by hand.
- **Camera access** that works reliably for label and plate scans.
- **Claude access for testers.** It only works inside claude.ai. The standalone `app/recomp.html` runs in "this device only" mode with the Claude features off.

## Success for the friends test

- Each tester logs at least 5 of 7 days in week 1.
- Food logging takes under 30 seconds per meal on average.
- No lost entries: an entry saved offline must appear later on every device.
- Crash-free sessions above 99%.
- Qualitative: testers say Today tells them what to do next without hunting.

## Out of scope for the test build

Payments, social features, coaching dashboards, a web app, tablet layouts, wearables beyond step counts, localisation beyond English, and imperial units (the app is metric only).
