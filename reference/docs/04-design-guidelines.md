# Recomp design guidelines

The web app in `app/recomp.html` is the visual reference. Every value here comes from it (version 2026-10-16 r15). Tokens are in `design/tokens.json`, and screenshots of each screen in both themes are in `screenshots/`.

## 1. Principles

1. **One job per screen.** Today answers "what do I do next". Analysis lives in Progress. Reference material sits behind closed rows.
2. **One accent, one main button.** Lime (`accent`) fills exactly one primary action per screen, plus progress rings and the running-timer card. Everything else is ink, outline or tint. If two lime buttons appear on one screen, one of them is wrong.
3. **Numbers on the card, not boxes inside the card.** Stats are large numbers with a muted label and a thin progress bar. No bordered tiles nested in cards.
4. **Hide what has nothing to say.** An empty stat does not render as a dash: it disappears, or collapses to one line that says what to log to fill it.
5. **Sentence case, plain words.** No all-caps labels, no letter-spaced eyebrows, no code-style fonts.
6. **Calm, not alarming.** Missed days and over-cap habits use warm orange (`warn`). Red (`danger`) is for destructive actions and real errors only.
7. **Works one-handed on a phone.** Touch targets are at least 44 px, the primary action sits within thumb reach, and the bottom bar stays in the same place on every screen.

## 2. Colour

See `design/tokens.json` for the full light and dark sets and the role of each token.

- **Ground:** `paper` behind everything, `surface` for cards, `surface-2` for inputs and quiet rows inside a card.
- **Text:** `ink`, `ink-2`, `muted`. Use `muted` only for labels, units and captions.
- **Accent:** `accent` is for fills. When accent must appear as text or as a small mark on a light ground, use `accent-ink` (olive in light mode, lime in dark mode). A lime bar on white is too faint to read.
- **Quote card:** uses `pause-bg` and `pause-ink`, near-black in light mode and deep olive in dark mode. Never build it from `ink`/`paper`, which invert in dark mode and turned the card into a white slab.
- **Contrast:** body text meets 4.5:1 and large text 3:1 in both themes. Colours that must be told apart, such as the Consistency grades, differ in lightness, not hue alone.

## 3. Typography

- One family: **Jost**. Numbers use tabular figures so columns line up.
- The scale is in the tokens file. Screen titles are 32 bold, card titles 23 bold, section titles 19 semibold, stat values 23 semibold, rows 16, body 15, labels 13 muted.
- Labels are sentence case with no letter-spacing ("kcal left", not "KCAL LEFT").
- Long quotes (over 100 characters) step down a size so they don't fill the card.

## 4. Layout and spacing

- 20 px screen gutters and a 14 px gap between cards. Card padding is 16 to 20 px, with a 16 px radius (20 px on large cards).
- List rows are at least 52 px tall and separated by `line-soft` hairlines, not boxed.
- The bottom bar is 68 px tall and floats 12 to 16 px above the safe area. Leave 104 px plus the safe-area inset of bottom padding on every screen so content never hides under it.
- Phone portrait only. A tablet layout isn't needed for testing.

## 5. Navigation

- **Bottom bar:** Today, Food, a central black **+**, Train, Progress. The active tab gets a soft `line-soft` tint, not lime, so the black + stays the only heavy shape in the bar.
- **Me:** opened from the round avatar button in the header. It holds the goal, plan, About you, notes, reminders, backup and settings.
- **Week strip:** a 7-day strip under the title on Today and Food only, with a coloured dot per day and swipe to change week. Other screens have their own day pickers where needed.
- **The + button** opens the quick-log sheet: weight, steps, sleep, waist (Mondays only), habit chips, and shortcuts to log a meal or sets.
- There is no separate Habits tab. Habits are tracked on Today, and every old link to the Habits page lands on Today's habit cards.

## 6. Screens, top to bottom

**Today**
1. Header: date, "Today", days-to-goal count, avatar.
2. A slim skip warning, only after missed sessions: one warm line with "Log a walk" and a close button.
3. Hero card: "Day N of total, Phase X", the session name, the exercise count, one lime **Start session** button, then three stats with thin bars (kcal left, g protein to go, steps of target).
4. Quote card: the quote, its author, the goal ring (% of weight goal), and "Your own evidence" chips (kg down, sessions logged, logging streak).
5. Habits: the real habit cards (see Components), with the day picker, Pomodoro and add buttons in the header.
6. Consistency: a compact four-week grid that opens the full view on Progress when tapped.

**Food**
1. Text input ("2 chapati, 1 katori dal, 1 apple"), Add, and the photo/label scan buttons.
2. One-tap cards for saved and recent meals. Each lists up to three items with their amounts, then "+N more" and the kcal.
3. Calories and protein bars, plus a carbs/fat/fiber line.
4. **The food table** (meal, item with its amount, kcal, P, C, F, fiber), grouped by meal with subtotals. The owner explicitly prefers this table to meal cards. Keep it.
5. Calorie chart, then the guides in closed rows.

**Train**
1. Session card: name, week and phase, Edit plan, and the lime **Start session** button, which opens session mode.
2. Warm-up and stretch, closed by default.
3. Exercise list: each exercise is ONE line (name, sets × reps) until tapped. Tapping opens its set grid. Finished exercises show a tick and the logged sets.
4. Session note, after-session cardio, steps, band setup, then the guides.

**Session mode** (full screen): the session name and timer, a progress bar per exercise, "Exercise n of N", the name and scheme, **Watch how on YouTube**, the suggestion line (last time and the next step), "How to do it", set chips, weight and reps steppers, the lime **Log set n** button, the rest timer (60/90/120/180 s, +15 s, Skip), and Back / Next exercise.

**Progress**
Weight vs plan chart (weight or waist, 1W/1M/3M/Goal), stat grid (latest, 7-day average, change, on-plan target, current-rate projection, days logged), the weigh-in card, full Consistency (stats, filter chips, month calendar, day breakdown), load volume chart, weekly review, the daily log folded under "Daily log, last 14 days", and guides.

**Me**
Your plan (phases, targets and sessions, all editable), all four phases (folded), goal, About you, notes, reminders, backup and export, history, and settings (theme, version, run setup again).

## 7. Components

- **Primary button:** `accent` fill, `on-accent` text, 52 px tall, 14 px radius, full width in cards.
- **Secondary button:** outline in `line` or `ink`, or a dark ink fill for a strong non-primary action.
- **Stat:** value (23 semibold), label (13 muted), and a 4 px bar in `line-soft` with an `ink` fill (`warn` when over target).
- **Habit card:** a ring button on the left (play for timed habits, the % for amount habits), the name with a star on the keystone habit, 7-day streak dots, and the amount and goal on the right. A running timer turns the card into a large lime-bordered card: "Running · Name", a big clock, "this session · logged today · goal", **Pause** and **Stop & log**, and an expand button to full-screen focus.
- **Limit habits** (stay under a cap) never show a tick during the day. They show "x of y max", turn `warn` when over, and count as done only once the day is over.
- **Consistency card:** a 7-column grid of the last 4 weeks, Monday to Sunday. Bars keep a 2.3:1 shape (18 to 32 px tall) with 7 px gaps. Grades: full = `accent-ink`, most = 58% mix, some = 26% mix, missed = 45% `warn` mix, empty = `line-soft`, future = outline only, today = 2 px ink ring. Footer: "n of N sessions this week · x% habits".
- **Quote card:** see Colour. The author goes under the line in 62% `pause-ink`.
- **Food table:** right-aligned numbers in tabular figures, the amount under the item name in caption size, and meal group headers in `accent-ink`.
- **Sheets:** a bottom sheet over a 42% black backdrop. Never show the backdrop without the sheet; the web app had that bug.
- **Guides:** accordion rows, closed by default.
- **Toasts:** bottom, above the bar, with an optional Undo.

## 8. Motion

View enter 340 ms slide, card enter 460 ms rise, sheet 240 ms up. All motion turns off under reduced motion. Nothing animates on a timer except clocks and rings.

## 9. Writing

Plain, specific, second person, sentence case. Say what happened and what to do ("Log 2 weigh-ins to see your trend"), never apologise in errors, and keep numbers in metric. Quotes always carry their real author; misattributed quotes are excluded.

## 10. Owner decisions (do not undo)

These came from the product owner while using the app daily:

| Decision | Why |
|---|---|
| Keep the food **table**; don't replace it with meal cards | A redesign swapped the table for meal cards; the owner rejected it and the table was restored. |
| One-tap meal cards show each item's **quantity** | Without amounts, a one-tap log was a guess. |
| **Checks removed**; habits take their place on Today | The owner tracks through habits. Medicines can be added as habits. |
| Habits tracked **on Today** with the full cards (timer, streak dots) | A separate Habits page hid the running timer. |
| Habits list shows **all** habits, no "start here" card | Wanted everything visible at a glance. |
| Quote card stays on Today **every day** | Motivation is a daily feature, not only after a missed session. |
| Quotes are **attributed** to notable people (athletes, Stoics, psychologists) | Generic unattributed lines were rejected. |
| **Consistency** stays on Today as a compact card | The full calendar lives on Progress. |
| Waist reminder on **Monday** (a calendar weekday), not the plan's week day | A training-block restart moved it to Tuesday. |
| A dish described with its ingredients stays **one** food entry | "Chicken salad with lettuce, capsicum, ..." must not split into rows. |
| "Boneless" changes the food match | Boneless and bone-in biryani differ in protein per gram. |
| Habits tab removed from the bar | Fewer destinations. Habits live on Today. |
