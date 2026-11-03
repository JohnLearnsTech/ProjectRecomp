# 05. Business logic

Source of truth: `app-r14.html` (build string `APP_VER = "2026-10-14 r14"`). Everything lives in one strict-mode IIFE. Function names below are the names in that file, so a reader can search for them. Where the code is ambiguous or looks wrong, this document says so and the item is repeated in the "Possible bugs" list at the end.

Conventions used here:

- "Day key" means a string `YYYY-MM-DD`.
- `entries[k]` is the log for one day (shape in section 11).
- `G` is the active goal, `PL` the active plan, `PROFILE` the profile object.
- Numbers like `trimNum(x)` mean "round to 1 decimal and drop a trailing `.0`".

---

## 1. Dates and calendars

### 1.1 Date primitives

| Function | Behavior |
|---|---|
| `d(s)` | Parses a day key into a `Date` at **UTC midnight** (`Date.UTC(y, m-1, d)`). All date math is done in UTC so DST never shifts a day. |
| `key(dt)` | `dt.toISOString().slice(0,10)`. Inverse of `d`. |
| `addDays(dt,n)` | UTC day arithmetic (`setUTCDate`). |
| `diffDays(a,b)` | `Math.round((b-a)/86400000)`. |
| `localKey(ms)` | The **device-local** calendar date (`getFullYear/getMonth/getDate`) of an instant. This is the only place the device time zone matters. |
| `todayKey()` | `localKey(Date.now())`. |
| `fmt(dt)` | `"Mon, 05 Oct 2026"` style. `shortDate(dt)` is `"05 Oct"`. |

Rule for a rebuild: "what day is it" comes from the device's local clock; everything after that is pure calendar arithmetic on day keys.

### 1.2 Global day state

| Name | Definition |
|---|---|
| `REAL` | `todayKey()` at boot, refreshed by `rollDay()`. The real calendar date. |
| `PREVIEW` | `diffDays(d(START), d(REAL)) < 0`, that is, the goal has not started yet. |
| `MAXDAY` | The latest loggable day: `PREVIEW ? START : (REAL > END ? END : REAL)`. Never the future, never past the goal end. |
| `TODAY` | The **browsed** day (despite its name). Starts at `MAXDAY`. Every edit writes to `entries[TODAY]`. |
| `P` | `plan(TODAY)`, recomputed whenever `TODAY` changes. |

`goToDay(k)`: calls `flushSave()` first, clamps `k` to `[START, END]`, sets `TODAY=k`, `P=plan(k)`, then `renderAll()`. Browsing is allowed over the whole goal, including future days; logging on future days (`TODAY > MAXDAY`) is disabled in the UI ("Preview only").

Badges, nudges, calendars, charts and streaks always anchor to `MAXDAY` (the real today), never to `TODAY`.

### 1.3 Day rollover: `rollDay()`

Called every 60 s (`__dayRoll` interval) and on `visibilitychange` when the page becomes visible.

```
now = todayKey()
if now == REAL: return false
wasOnToday = (TODAY == MAXDAY)
REAL = now
PREVIEW = diffDays(d(START), d(REAL)) < 0
MAXDAY = PREVIEW ? START : min(REAL, END)
if wasOnToday or TODAY > MAXDAY: TODAY = MAXDAY
P = plan(TODAY)
return true          // caller then runs renderAll()
```

Why it exists: a phone that kept the page open overnight used to treat yesterday as "today", so a skipped session stayed "pending" instead of becoming "missed".

### 1.4 The two timelines

`applyGoal()` builds two parallel timelines from the active goal.

| Timeline | Start | End | Derived constants |
|---|---|---|---|
| Goal (weight) timeline | `START = G.start` | `END = G.due` | `TOTAL = max(1, diffDays(START,END)+1)`, `WEEKS_N = max(1, ceil(TOTAL/7))`, `PHASE_W = phaseBounds(WEEKS_N)`, `MAINT_W = max(1, PHASE_W[1][1]-1)` |
| Training timeline | `TSTART = G.trainStart \|\| G.start` | `END` (same) | `TTOTAL = max(1, diffDays(TSTART,END)+1)`, `TWEEKS = max(1, ceil(TTOTAL/7))`, `TPHASE_W = phaseBounds(TWEEKS)`, `TMAINT_W = max(1, TPHASE_W[1][1]-1)` |

Also: `DEPART = G.event || G.due` (the countdown target), `START_KG`, `TARGET_KG`, `PROJ = buildProj()`, and `LABS`/`TASKS` maps built from `G.milestones` (`m.k==="lab"` goes to `LABS[m.d]`, anything else to `TASKS[m.d]`).

Why two: the design allows a training block to be restarted (Phase 1 begins again "today") without moving the weight projection, which must stay anchored to the original start and start weight. In r14 no UI sets `trainStart` to anything other than the goal start (onboarding sets `trainStart: st`; the provisional goal sets it to today; "Next goal" omits it so it falls back to `G.start`). A `trainStart` can still arrive from older data or a backup, and editing the goal start under Me does **not** move `trainStart` (see Possible bugs).

Which feature uses which timeline:

| Uses the **goal** timeline (`START`, `TOTAL`, `WEEKS_N`, `MAINT_W`) | Uses the **training** timeline (`TSTART`, `TTOTAL`, `TPHASE_W`, `TMAINT_W`) via `plan(k)` |
|---|---|
| Weight projection `buildProj`, `projFor` (flat week at `MAINT_W`) | Session type per day, week number, phase, dow |
| `series()`, rolling average, `rateOfLoss`, weight chart, waist chart | Phase list dates (`renderPhases`), plan view dates |
| "On plan" target stat (`renderStats` uses `pidx = diffDays(START, TODAY)`) | +500 kcal maintenance week (`TMAINT_W`) and the phase 2 text "Week N is a maintenance week" |
| Day counter "Day X of TOTAL", goal progress bars | Phase step targets |
| Habit streaks, strength, % (`habitStreak`, `habitLongest`, `habitStrength`, `habitPct`) | Checklist contents (lift vs cardio vs rest, progress photos rule `p.dow===6 && p.week%4===0`) |
| `streaks()`, `missStats()` loop ranges, `habitsHitPct`, kcal chart x axis | Streak/miss **classification** per day (each day calls `plan(k)`) |
| `lastFor`, `lastSameSession`, `progExercises`, `exSeries` (search range) | Reminders: training-day recurrence, weekly-review weekday (`TSTART + 6`) |
| Calendar month clamp, week strip disabled range | `planWeekdays()` (day 1 of a plan week is TSTART's weekday) |

The waist day is neither: it is a pure calendar weekday (section 1.6).

### 1.5 `phaseBounds(w)`

Four phases, proportions fixed (17 weeks gives 4/6/5/2):

```
b1 = max(1, round(w*0.235))
b2 = max(b1+1, round(w*0.588))
b3 = max(b2+1, round(w*0.882))
if b3 >= w: b3 = max(b2+1, w-1)
if b2 >= b3: b2 = max(b1+1, b3-1)
if b1 >= b2: b1 = max(1, b2-1)
return [[1,b1],[b1+1,b2],[b2+1,b3],[b3+1,w]]
```

Worked values: 12 weeks gives `[[1,3],[4,7],[8,11],[12,12]]` (b1=round(2.82)=3, b2=round(7.06)=7, b3=round(10.58)=11). For very short goals (w < 4) bounds overlap or go empty; the code does not guard that beyond the `max()` calls.

Maintenance week index = last week of phase 2 minus 1 (`PHASE_W[1][1]-1`). On 12 weeks that is week 6.

### 1.6 Waist day

`waistWeekday()`: `PROFILE.waistDay` (0 Sunday to 6 Saturday, taken `% 7`) if set and numeric, else **1 (Monday)**. `plan(k).waistDay = d(k).getUTCDay() === waistWeekday()`. It is a calendar weekday on purpose; it must not depend on plan week or trainStart. There is no UI in r14 to set `PROFILE.waistDay`; it can only come from data.

---

## 2. Onboarding and targets

### 2.1 Provisional goal

`provisionalGoal()` is used when no goals exist. It is never saved (`saveGoals()` deletes the `provisional` flag from every goal, and `finishOnboarding` filters provisional goals out).

```
{id:"g0", provisional:true, name:"", why:"", type:"recomp", start:today, due:today+83,
 event:null, trainStart:today, startKg:null, targetKg:null, kcal:2000, protein:120,
 steps:8000, homeFirst:false, done:false, milestones:[]}
```

`activeGoal()`: the last goal with `!done`; otherwise the last goal; otherwise a fresh provisional goal.

`maybeOnboard()` opens onboarding only if `G.provisional` and it has not been shown this session. It is called when the db is unavailable, when `state/goals` is empty, or when db loading fails.

### 2.2 Wizard steps (`renderOb`, `obClick`)

Step 0 hero, then 5 steps:

1. About you: name, age (13 to 100), height cm (120 to 230), weight kg (30 to 350), sex chips (`female`, `male`, `""`). "Next" is blocked until age, height and weight are in range.
2. Goal: type chips (`lose`, `recomp`, `muscle`, `health`), weeks chips (8, 12, 16, 24; default 12), target weight (prefilled from `calcTargets().targetKg` when blank), optional name. Changing type or weeks, or typing weight or height, clears the target so it is recomputed.
3. Training: equipment (`gym`, `home`, `body`, `homefirst`), days per week (2 to 5; default 3), joint-friendly checkbox.
4. Life: current steps chips (3000 "Under 4k", 5000 "4 to 7k", 8000 "7 to 10k", 11000 "10k+"; default 5000), cuisine text, up to 3 habits from `HABIT_OPTS`.
5. Summary from `calcTargets`, then "Start" calls `finishOnboarding()`.

`HABIT_OPTS`: Walk build 20 min step 5; Read build 10 pages step 5; Meditate build 10 min step 5; Deep work build 2 h step 0.5; Screen time limit 2 h step 0.5; No sugar limit 0 times step 1; Journal build 1 times step 1; Stretch build 10 min step 5.

### 2.3 `calcTargets(a)`

Mifflin-St Jeor BMR with an activity factor from steps and training days.

```
bmr  = 10*w + 6.25*h - 5*age + (sex=="male" ? 5 : sex=="female" ? -161 : -78)
f    = (steps<5000 ? 1.25 : steps<8000 ? 1.35 : steps<10000 ? 1.45 : 1.55) + 0.02*days
tdee = bmr * f
floor = sex=="female" ? 1200 : sex=="male" ? 1500 : 1400

kcal = lose   : tdee - min(900, tdee*0.22)
       recomp : tdee * 0.90
       muscle : tdee * 1.10
       health : tdee
kcal = max(floor, round(kcal/50)*50)

ref     = min(w, 25 * (h/100)^2)            // weight at BMI 25, so protein is not overstated
protein = round(factor*ref/5)*5   where factor = muscle 2.0, health 1.4, else 1.8   (g/kg)
steps   = min(12000, max(6000, round((currentSteps+2000)/500)*500))

wk = weeks (default 12)
targetKg = lose   : w*(1 - 0.0065*wk)
           muscle : w*(1 + 0.0025*wk)
           else   : w
targetKg rounded to the nearest 0.5 kg
returns {kcal, protein, steps, floor, tdee: round(tdee), targetKg}
```

`steps` default inside the formula is `+a.steps || 5000`; `days` default 3.

### 2.4 `finishOnboarding()`

1. Every existing goal that is not done and not provisional is marked `done:true, endKg: latestWeight()`. Provisional goals are removed.
2. Push a new goal:
   - `name`: typed name, else `{lose:"Lean out", recomp:"Recomp", muscle:"Build muscle", health:"Feel better"}[type]`
   - `start = trainStart = todayKey()`, `due = start + weeks*7 - 1` (so `TOTAL = weeks*7`)
   - `startKg = weight`, `targetKg = typed target if > 30 else calcTargets().targetKg`
   - `kcal`, `protein`, `steps` from `calcTargets`, `homeFirst = (equip=="homefirst")`, `event:null`, `milestones:[]`.
3. Profile: name, sex, age, heightCm, cuisine, `equip` (`homefirst` stored as `gym`), `days`, `jointFriendly`, `setupAt`.
4. Picked habits are appended unless a habit with the same name (case-insensitive) exists. Ids `"h"+Date.now().toString(36)+i`.
5. If today's entry has no weight, write `entries[today].w = weight` and persist that day.
6. `planSaved = null` (back to the default plan), persist plan, save goals and profile, `refreshGoal()`, go to `MAXDAY`, show Today.

Re-running setup from Me (`btnSetup`) opens the wizard at step 1 with a close button.

### 2.5 Floors

| Function | Rule |
|---|---|
| `kcalFloor()` | `+PROFILE.kcalFloor` if set, else female 1200, male 1500, other 1400. Editable under About you (accepted range 900 to 4000). |
| `proteinFloor()` | `+PROFILE.proteinFloor` if set, else `round((G.protein or 120)*0.85/5)*5`. Editable (30 to 300). |

Floors are enforced in: plan target editing (`kcal` must be in `[kcalFloor, 4500]`), Claude plan proposals (`kcal` in `[kcalFloor, 4500]`, protein in `[proteinFloor, 320]`), weekly review calorie cuts (never below `kcalFloor`), and they are written into the Claude plan prompt as hard rules.

### 2.6 Editing the goal (`gSave`), next goal (`gNext`), milestones

- `gSave`: requires `due > start`. `event` is kept only if it is on or after `due` and at most 30 days after it; otherwise it is cleared with a message. Numbers: `kcal || 2200`, `protein || 180`, `steps || 8000`. If a saved plan exists and steps changed, every phase's steps move by the same delta (floor 2000) and the plan is persisted (no `planPrev` entry). `homeFirst` from the checkbox. Then `saveGoals(); refreshGoal()`.
- `gNext` ("finish this goal, start the next"): marks current `done`, `endKg = latestWeight()`; new goal starts today, due today+83 (12 weeks), `type` copied, `startKg = latest weight or target or start`, target: `type=="gain"` gives start+3, `type=="maintain"` gives start, anything else gives `max(0, start-8)` (see Possible bugs: `gain`/`maintain` are not real types). kcal/protein/steps copied with defaults 2200/180/8000.
- Milestones: `{d, k:"lab"|"task", t}` added under Goal; shown on the Today checklist on their day, on the phase list, and as calendar reminders.

---

## 3. Plan engine

### 3.1 Plan document

```
{ v:1, by:"default"|"claude"|"you", at:ms|null, note:string,
  programs: { <key>: {name, kit:"gym"|"home"|"body", ex:["name|scheme|cue", ...]} },
  targets:  { carb, fat, fiber },          // grams
  phases: [ 4 x { name, detail, steps, weeks:[ week, week? ] } ] }
week = array of exactly 7 slots, slot = {t:"lift", s:<program key>, c} | {t:"cardio", c} | {t:"rest", c}
```

`applyPlan()`: `PL = planSaved || defaultPlan()`; builds `LIFTS[key] = ex`, `NAMES[key] = name`, and `PHASES[i] = {w: TPHASE_W[i], name, detail}`.

`defaultPlan()`: `G.homeFirst ? homeFirstPlan() : makePlan()`. With no saved plan the default is rebuilt from the goal and profile every time, so changing kcal, steps, equipment or days changes it.

### 3.2 `makePlan()`

Inputs: `equip = PROFILE.equip || "gym"`, `days = clamp(PROFILE.days || 3, 2, 5)`, `st = G.steps || 8000`, `kc = G.kcal || 2200`.

- Session A/B: home gives `homeA/homeB`, body gives `bodyA/bodyB`, else `fullA/fullB`.
- `split = (equip=="gym" && days>=4)` uses `lowerA, upperA, lowerB, upperB`.
- Slot texts: `walk = "Walk 20 to 30 minutes at an easy pace."`; `after` (lift-day note) = gym "10 to 15 minutes of easy cardio after lifting." else "A 10-minute brisk walk after the session."; rest "Rest day. A walk if you feel like it."
- `extra` for day 6 when days >= 5: hard weeks (phase 3) "Intervals: 8 × (1 min hard / 2 min easy) on a bike, plus 10 min easy.", otherwise "Your choice: a class, a sport or a long walk."; for days < 5 it is the walk.

Week layout `lay(x, y, hard)` (index 0 = TSTART's weekday):

| days | Layout |
|---|---|
| 2 | L(x), C(walk), C(walk), L(y), C(walk), C(walk), R |
| 3 | L(x), C(walk), L(y), C(walk), L(x), C(walk), R |
| split (gym, 4 or 5) | L(lowerA), L(upperA), C("Zone 2, 30 minutes: bike, incline walk or elliptical."), L(lowerB), L(upperB), C(extra), R |
| 4 or 5 non-gym | L(x), L(y), C(walk), L(x), L(y), C(extra), R |

Each phase has `weeks: [lay(A,B), lay(B,A)]` (phase 3 passes `hard=true`). For the split layout both weeks are identical.

Targets: `fat = round(kc*0.28/9)`, `carb = max(50, round((kc - protein*4 - fat*9)/4))`, `fiber = max(20, round(kc/1000*14))` where protein is `G.protein || 120`.

Phases:

| # | Name | Steps |
|---|---|---|
| 1 | "Phase 1 · Base" | st |
| 2 | "Phase 2 · Build" | min(15000, st+1000) |
| 3 | "Phase 3 · Push" | min(15000, st+1500) |
| 4 | "Phase 4 · Sharpen" | min(15000, st+1500) |

Phase 2 detail mentions "Week {TMAINT_W} is a planned maintenance week at {kc+500} kcal" only when `G.type` is `lose` (or missing).

### 3.3 `homeFirstPlan()`

Programs: all 8 legacy keys (`homeA, homeB, fullA, fullB, lowerA, upperA, lowerB, upperB`), kit home for homeA/B, gym otherwise. Targets fixed: carb 200, fat 65, fiber 33.

- Full-body week `wk(x,y)`: L(x), C(off), L(y), C(off), L(x), C(off), R. Phase 1 uses home A/B if `homeFirst`; phase 4 uses gym full body.
- Split week (phases 2 and 3): L(lowerA), L(upperA), C("{z} min Zone 2 (bike, elliptical or incline treadmill)."), L(lowerB), L(upperB), C(phase 3: intervals text, phase 2: "{z} min Zone 2."), R("Rest day. Hit your step target, nothing structured."). Both weeks identical. `z` = "30–35" (phase 2) and "40–45" (phase 3).
- Steps: phase 1 st, phase 2 st+1000, phases 3 and 4 st+2000 (no 15000 cap here).
- Phase 2 detail always mentions the maintenance week (no goal type check).

### 3.4 `normPlan(x)`: validation for anything loaded or returned by Claude

Refuses (returns `null`) unless: object, `programs` object, `phases` array of length exactly 4.

- Programs: first 16 keys; key sanitized to `[A-Za-z0-9_-]`, max 24 chars. Each `ex` line split on `|`: name trimmed max 90; scheme trimmed, first `(\d)\s*[xX*]\s*(\d)` normalized to `"$1 × $2"`, max 30; cue = rest joined by space, max 400. A line without a name or without a digit in the scheme is dropped. Max 12 exercises. A program with no valid exercises is dropped. `name` max 40 (default key), `kit` is `home`/`body` if given, else `gym`. No programs left gives `null`.
- Each phase must have a non-empty `weeks` array; only the first 2 weeks are kept; each week must be exactly 7 slots (else `null`). Slot: `lift` only if `s` names a surviving program, else falls through to `cardio`; `rest` keeps `c` or "Rest day."; anything else becomes `cardio` with `c` or "Walk at an easy pace."; `c` max 220.
- Phase `name` max 40 (default "Phase N"), `detail` max 700, `steps` clamped to `[2000, 30000]` (default 8000).
- Targets: carb `[50,500]` default 200, fat `[20,200]` default 65, fiber `[10,80]` default 33 (out of range gives default, not clamp).
- `by` is `claude`/`you` or `default`; `note` max 140.

### 3.5 `plan(k)`: the schedule for one day

```
idx     = diffDays(d(TSTART), d(k))
inRange = idx >= 0 && idx < TTOTAL
week    = inRange ? floor(idx/7)+1 : (idx<0 ? 0 : TWEEKS+1)
dow     = ((idx % 7) + 7) % 7          // 0 = TSTART's weekday
phase   = idx<0 ? 1 : 4, then the phase whose TPHASE_W range contains week
lab     = LABS[k] || null,  task = TASKS[k] || null
waistDay = d(k).getUTCDay() === waistWeekday()

kcal    = (week == TMAINT_W && (G.type||"lose") == "lose") ? G.kcal+500 : G.kcal     // G.kcal default 2200
protein = G.protein || 180
steps   = PL.phases[phase-1].steps, fallback phase1 st, phase2 st+1000, else st+2000

if !inRange: type="off", session=null, cardio=""; return
template = ph.weeks[ (week%2==0 && ph.weeks[1]) ? 1 : 0 ]      // odd weeks first layout, even weeks second
slot     = template[dow] || {t:"rest", c:""}
session  = (slot.t=="lift" && LIFTS[slot.s]) ? slot.s : null
cardio   = slot.c || ""
type     = session ? "lift" : (slot.t=="rest" ? "rest" : "cardio")
```

Note: `week` is the absolute week number of the training timeline, so odd/even alternates across phase boundaries too.

### 3.6 Exercise line format and swaps

Line: `"name|scheme|cue"`, for example `"Leg press|3 × 10-12|Feet mid-platform..."`. Scheme uses the multiplication sign U+00D7. Sets and reps are parsed from it:

| Function | Rule |
|---|---|
| `setCount(scheme)` | `/(\d+)\s*×/` first number, default 3. |
| `topReps(scheme)` | Text after `×`; last integer in it; `null` if it contains `\bs\b` or `sec` (timed). |
| `repRange(sch)` | After `×`: `(\d+)(?:\s*-\s*(\d+))?` gives `{lo, hi}`; default `{10,10}`. |
| timed | `/\bs\b\|sec/` on the text after `×` (for example "3 × 30 s"). |

Swaps (`resolveLine(session, defLine)`):

- `EXGROUP[defaultName]` maps a built-in exercise name to a muscle slot (for example `"Leg press" -> "squat-g"`). Only built-in names are mapped; a Claude- or user-added exercise has no pool.
- `ALTPOOL[slot][ctx]` lists alternates as `"Name|cue|muscles"`. `ctx = ctxOf(session)`: program kit `home` or `body` gives `home`, else `gym`. Home and gym pools are separate.
- `swaps["session|Default name"] = "Chosen name"` (stored `goa:swaps` and `state/swaps {map}`). Swap is per session key, so the same default exercise can be swapped differently in two sessions.
- The scheme always comes from the session line; a swap changes only name and cue. If the chosen alternate is no longer in the pool, the default is shown.
- **Logged sets are keyed by the displayed (possibly swapped) name**, so history follows the movement, not the slot.

### 3.7 Load kinds (`loadKind(name)`)

1. `/\bband\b/i` gives `band`.
2. Any of the `BODY_RX` patterns gives `body` (incline/wall/knee/close-grip push-up, incline/side/reverse plank, plank on the wall, `^split squat, hand on chair`, `^low-step step-up`, `^reverse lunge to a chair`, back extension, `^chair squat`, `^reverse lunge, hand on a chair`, towel row, `^wall sit`, standing march, isometric row, calf raise on a step, knee-to-elbow, `^single-leg rdl, hand on chair`).
3. Otherwise `weight`.

Set storage: `entries[k].sets[name] = [{w?, r?, b?}, ...]` where `w` kg, `r` reps or seconds, `b` band slot 1 to 5. Legacy single object `{w,r}` is read as a one-set list (`setsFor`). `filled(arr)` keeps sets with any of `w/r/b`. `writeSet` writes one field and trims empty trailing sets; an exercise with no sets is deleted. When reps are entered on a set with an empty load box, the nearest earlier set's load is copied in visibly.

Bands: 5 slots lightest to heaviest, `{n, kg|null}`, default names "Band 1".."Band 5" (`goa:bands`, `state/bands {names}`). Band kg is only used for volume.

`stepFor(name)`: 5 kg if the name matches `/leg press|squat|hip thrust|leg curl|leg extension|calf|romanian|deadlift|step-up|glute/i`, else 2.5 kg.

### 3.8 Progression

Inline hint on the Train page (`renderToday`):

- `lp = lastFor(name)`: the latest day **strictly before TODAY**, scanning the goal timeline from START, with any filled set for that exact name.
- `allTop = top && lp.sets.length >= setCount(sch) && every set has r >= top`.
- If `allTop`: band kind gives "move up to {next band}" (if highest band used `hb` is 1..4) else "slow the lowering, or shorten the band"; body kind **or phase 1** gives "add a rep or slow the lowering"; else "add {stepFor} kg".

Session mode suggestion `woSuggest(nm, sch, kind, lp)` (double progression):

| Case | Suggestion |
|---|---|
| No history | weight: "pick a load you could do (hi+2) times, and stop at lo"; band: start on a band you could do hi+2 with; body: aim for lo reps/s. Reps prefill `lo`. |
| weight, allTop, has lastW, phase != 1 | load `lastW + stepFor`, reps `lo` |
| weight, allTop (phase 1 or no load) | same load, reps `hi`, "slow the lowering to 3 seconds" |
| weight, not allTop | same load, reps `min(hi, firstLoggedReps+1)` |
| band, allTop, lastB < 5 | band `lastB+1`, reps `lo` |
| band otherwise | same band, reps `hi` if allTop else +1 rep |
| body | reps `hi` if allTop else +1 |

`lastW` and `lastB` are the max across last time's sets; `lastR` is the first set's reps.

`exDone(nm, sch)`: count of today's sets with `r != null` is at least `setCount(sch)`.

Volume (`volumeOf(k)`): for the day's planned session only, sum `load*reps` across sets with reps, where load is `w` (weight) or `bandKg(b)` (band). Timed sets, bodyweight sets and sets with no positive load count as `out`. `lastSameSession()` finds the latest earlier day with the same `plan(k).session` and `kg > 0`. Per-exercise progress chart (`exVolume`, `progExercises`, `exSeries`) uses the same formula for any exercise name across the goal timeline.

PRs (`bestBefore`, `bestToday`): best of `w` (weight), `b` (band index) or `r` (body) among sets with reps; `bestBefore` scans **all** entries before TODAY, any goal. A "New best" toast fires when a logged set beats both the previous best before today and today's earlier best.

---

## 4. Weight projection

### 4.1 `START_KG` and `TARGET_KG`

`START_KG = +G.startKg`, else the weight of the first logged day on or after START, else 0. `TARGET_KG = +G.targetKg || START_KG`.

### 4.2 `buildProj()`

Per-week shares of the total change: weeks 1 and 2 (or fewer if the goal is shorter) weigh 1.9, the maintenance week `MAINT_W` weighs 0, all others 1.

```
drop = START_KG - TARGET_KG          // negative for a gain goal, so the line rises
share[i] = (i <= min(2, WEEKS_N)) ? 1.9 : (i == MAINT_W ? 0 : 1)     for i = 1..WEEKS_N
sum = Σ share (or 1)
PROJ[0] = START_KG; PROJ[i] = PROJ[i-1] - drop*share[i]/sum, rounded to 0.01
```

The flat week applies to every goal type (not only `lose`), and it uses the **goal** timeline `MAINT_W`, while the +500 kcal uses the training timeline `TMAINT_W`.

### 4.3 `projFor(idx)` (idx = days since START)

```
t  = TOTAL>1 ? idx/(TOTAL-1) * WEEKS_N : 0
lo = min(last, floor(t)); hi = min(last, lo+1); f = t - floor(t)
return PROJ[lo]*(1-f) + PROJ[hi]*f
```

This pins day 0 to START_KG and the last day to TARGET_KG exactly.

### 4.4 Rolling 7-day average: `rolling(arr, upto)`

Mean of non-null weights at indices `max(0, upto-6) .. upto` (7 calendar days). Returns `null` if fewer than 2 weigh-ins in that window.

### 4.5 `rateOfLoss()`

Least-squares slope through logged weights in the last 28 days ending at `MAXDAY` (`tIdx-27 .. tIdx`, goal timeline indices).

- Needs at least 4 points spanning at least 9 days, else `null`.
- `perDay = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)`; `null` if the denominator is 0. Negative means losing.
- Stats card: only when `perDay < 0` and a latest weight exists: `projEnd = last + perDay*((TOTAL-1) - tIdx)`, `kg/wk = perDay*7`, and if target is below the latest weight, ETA date = `MAXDAY + round((TARGET-last)/perDay)` (shown if 0 < days < 3650). Otherwise it shows "trend is flat or up, no loss to project" (or "needs 2+ weeks of weigh-ins" when `null`). Gain goals therefore never get a rate projection.
- `lossPerWeekKg` sent to Claude: `round1(-perDay*7)` only when `perDay < 0`, else `null`.

### 4.6 Stats (`renderStats`)

| Stat | Formula |
|---|---|
| Latest | Last non-null weight in the goal timeline. |
| 7-day avg | `rolling(series, lastWeighInIndex)`. |
| Change | `latest - START_KG`. |
| On-plan target | `pidx = clamp(diffDays(START, TODAY), 0, TOTAL-1)`; `pj = projFor(pidx)`. Uses the **goal** day index on purpose (not `P.idx`, which counts from TSTART). |
| On-plan verdict | `avAt = rolling(series, min(pidx, lastWeighIn))`, fallback that day's weight, fallback latest. `|avAt - pj| < 0.15` gives "level with it". Behind/ahead: for a gain goal (`TARGET >= START`) behind means `avAt < pj`; for a loss goal behind means `avAt > pj`. |
| Logged days | Day keys in `[START, MAXDAY]` whose entry has at least one non-empty field (empty objects do not count). Shown "of TOTAL". |
| Countdown | `diffDays(todayKey(), DEPART)` floored at 0. |

### 4.7 Landing range and outcome text

Hard-coded asymmetric band: `TARGET_KG - 1.5` to `TARGET_KG + 3.5` kg (`renderChart` note, `renderOutcome`). `renderOutcome` also says "roughly (drop-1.5) to (drop+1.5) kg down" with `drop = max(0, START-TARGET)`. Both assume a loss goal.

### 4.8 Goal progress bars (`renderGoal`) and ring (`renderFuel`)

- Time: `elapsed = clamp(diffDays(START, REAL)+1, 0, TOTAL)`, `tp = elapsed/TOTAL*100`.
- Weight: loss goal `lost = START - now`, `toGo = START - TARGET`; gain goal (`TARGET > START`) `lost = now - START`, `toGo = TARGET - START`. `wp = clamp(lost/toGo*100)`. Message "keeping up" when `wp >= tp - 4`.
- Today ring (`pNum`): `moved/|START-TARGET|*100` with direction by goal sign.

### 4.9 Earlier weigh-ins

`PROFILE.history = [{d, kg, note}]` (added under Me, kg must be 20 to 400, one per date). `histW()` keeps those before START and draws them as a faded line on chart ranges that reach that far back. Never used in the projection.

---

## 5. Food pipeline

### 5.1 Flow overview

```
foodBox text
  -> splitItems(raw)         split on , ; newline, ". " and the word "and" (outside brackets)
  -> joinDish(parts)         a dish + its ingredients collapses back into one item
  -> for each part: parseItem -> matchFood
        hit  -> fromEntry -> row {src:"table"}
        miss -> placeholder row {src:"pending"} (or "none" without Claude)
  -> all rows of this Add share meal = (max existing meal)+1
  -> syncFoodToDay, render, persist
  -> estimate(unknown) async -> fill the same row objects -> syncFoodToDay(fk), persist(false, fk)
```

### 5.2 `splitItems(raw)`

Character scanner with bracket depth for `(` `[` and `)` `]`. At depth 0 it splits on:

- `,` `;` `\n`
- `.` followed by whitespace or end of string (so "1.5" stays)
- the word `and` (case-insensitive) when the characters before and after are not `[A-Za-z0-9]`

Parts are trimmed and empties dropped. Delimiters inside brackets never split.

### 5.3 Dishes: `isDish` and `joinDish`

```
DISH_RX = /\b(salads?|bowls?|sandwich(es)?|subs?|wraps?|rolls?|smoothies?|shakes?|soups?|burritos?|poke|omelett?es?|pasta|noodles|stir[\s-]?fry|platters?|thalis?|parfaits?|oats|oatmeal|porridge|muesli|granola|burgers?|tacos?|quesadillas?|pizzas?|frankies?|kathi)\b/i
WITH_RX = /\bwith\b|\bmade (?:with|of)\b|\bcontain(?:s|ing)\b|\bincluding\b|:/i
isDish(desc) = DISH_RX.test(desc) && WITH_RX.test(desc)
```

`joinDish(parts)`: the first part that is a dish and is not the last part absorbs **every following part**. If it has a colon: `"<before colon> with <after colon>, <rest...>"`; else `"<part>, <rest joined by ', '>"`. Earlier parts stay separate. So "2 roti, chicken salad with lettuce, capsicum, 20 g dressing" gives `["2 roti", "chicken salad with lettuce, capsicum, 20 g dressing"]`.

### 5.4 `parseItem(raw)`

```
s = " " + collapsed(raw) + " "
grams: first /(\d+(?:\.\d+)?)\s*(kgs?|gms?|grams?|g|ml|litres?|l)\b/i
       kg or l(itre) units x1000, others as-is (ml counts as grams); removed from s
count: first /(?:^|\s)(\d+(?:\.\d+)?|half|one|two|three|four)(?=\s)/i  (half=0.5 ... four=4); removed
strip words: katori(s) bowl(s) cup(s) slice(s) piece(s) pc(s) scoop(s) tsp(s) tbsp(s) teaspoon(s)
             tablespoon(s) plate(s) glass(es) bottle(s) peg(s) no(s) of a an small medium large
             approx about around
returns {grams, count, name, raw}
```

### 5.5 `matchFood(name)`

1. `normFood`: lowercase, non-alphanumerics to space, remove the words `with and of in a an the`, collapse spaces. Applied to the input and to every keyword (`foodRe`).
2. For every entry in `FOODS_ALL` (the user's `PROFILE.myFoods` first, then built-in `FOODS`), each keyword is a regex `\b<kw>s?\b`. The **longest matching keyword wins**; on equal length the earlier entry wins (so user foods win ties).
3. Leftover-word rule: remove the matched keyword (with optional `s`) from the normalized name; split the remainder into alphabetic words. A word "counts against" the match if it is longer than 2 letters, is not a `MODIFIER`, and is not a whole word of the entry's own name `n`. Any such word makes the match `null` (sent to Claude).

```
MODIFIER = raw cooked uncooked boiled grilled roasted baked steamed air fried airfried pan plain fresh
           leftover skinless home homemade hot cold warm chopped sliced diced whole light lightly soft
           dry wet extra and with for from the my some
```

Examples: "chicken salad" leaves "salad", which is not a word of "Chicken breast, cooked", so null (goes to Claude). "boneless chicken biryani" matches the longer boneless key. "chicken tikka with bone" normalizes to "chicken tikka bone", which is itself a key of the bone-in tikka entry, so it matches that entry. "chicken thigh bone-in" normalizes to "chicken thigh bone" ("in" is dropped); the key "chicken thigh" matches but leaves "bone", which is not a whole word of "Chicken thigh, boneless, cooked" ("boneless" does not count), so null.

User foods (`PROFILE.myFoods`) are only accepted with `n`, non-empty `k` array, `v` of length 5, `per` in `unit|100g`, `g > 0`. There is no UI in r14 to add them; they come from data.

### 5.6 `fromEntry(it, f)`: table scaling

Food entry: `{n, k, per:"unit"|"100g", g, v:[kcal, protein, carbs, fat, fiber]}`. For `unit`, `v` is per piece and `g` the piece weight; for `100g`, `v` is per 100 g and `g` the default serving.

| per | grams given | count given | neither |
|---|---|---|---|
| unit | `mult = grams/g`, label `"n (G g)"` | `mult = count`, label `"n (C × g g)"` | `mult = 1`, assumed |
| 100g | `grams` | `grams = count*g` | `grams = g`, assumed |

For `100g`, `mult = grams/100`; label `"n (G g)"`, or `"n (C × g g = G g)"` when a non-1 count and no grams. Assumed portions append `" · assumed serving"`. Row: `{label, kcal, p, c, f, fib (all = v*mult, unrounded), src:"table", raw}`.

### 5.7 `estimate(list)` with Claude

Per description:

1. If not a dish and `estCache["v2:"+canonName(desc)]` has `per100`, use it: `po = portionOf(desc, rec)`, `scaleEst(rec, po.g, po.n)`.
2. Otherwise collect into one `askClaude(misses)` call (one array, order preserved).
3. For each reply object with `per100`: `rec = {name: r.name || desc, serving_g: +r.serving_g || 100, per100:{kcal,p,c,f,fib}}` (numbers, default 0). Non-dish recs are cached under `v2:canonName(desc)`. Then scale. Cache saved once after the batch.

`portionOf(desc, rec)`:

- dish: `{g: rec.serving_g || 100, n: null}` (the whole listed dish)
- grams in the text (`parseGrams`): `{g, n:null}`
- else `n = parseItem(desc).count` if > 0: `{g: (n||1) * serving_g, n}`

`parseGrams(desc)`: `(\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|grams?|ml|l|litres?|liters?)\b`, kg/l x1000, ml as grams, null if not positive.

`scaleEst(rec, grams, n)`: `m = grams/100`; kcal rounded to integer, macros to 1 decimal. Label: with count `n` and `rec.unitOnly`: `"name (n)"`; with count otherwise `"name (n × serving_g g)"`; without count `"name (grams g)"`. Returns `{label, by: rec.by || null, kcal, p, c, f, fib}`. Callers set `row.src = (r.by === "you") ? "you" : "claude"`.

### 5.8 Estimate cache

`canonName(desc)`, the cache key (quantity free and word-order free):

```
s = lowercase
remove /\b\d+(?:\.\d+)?\s*(kg|kgs|g|gm|gms|grams?|ml|l|litres?|liters?|katori|cups?|glass(?:es)?|tbsp|tsp|scoops?|pieces?|pcs?|slices?|nos?|packets?|bars?|sticks?|bowls?|plates?)\b/g
remove /\bfrom\b[\s\S]*$/            // "from <place>" tail
replace /[^a-z ]+/ with space        // digits and punctuation out (bare counts disappear here)
drop STOP words: boneless cooked uncooked homemade home made plain fresh leftover hot cold warm some
                 a an the of with and in assorted approx est typical serving servings large small
                 medium regular each whole
sort remaining words, join with " "
```

Key format `"v2:" + canonName`. Cooking methods (grilled, fried...) are kept because they change per-100 g values.

Record shapes in `estCache`:

| Source | Record |
|---|---|
| Claude | `{name, serving_g, per100:{kcal,p,c,f,fib}}` |
| `rememberFood` (user edited a row) | `{name, serving_g: grams? grams : 100, unitOnly: !grams, by:"you", per100}` |
| Label log | `{name, serving_g: grams eaten, by:"you", per100}` (no `unitOnly`) |

`rememberFood(raw, label, r, grams)`: called on "Save row" when the numbers changed and the result is tagged `you`. `g0 = grams or parseGrams(raw)`. With no grams, it stores **one piece**: `cnt = parseItem(raw).count || 1`, `g = 100*cnt`, so per100 is really "per piece" and `serving_g = 100`, `unitOnly = true`; later "4 eggs" prices as 4 pieces. With grams, per100 = row values * 100/g. Name = label without a trailing `(...)`.

Stored in `goa:estcache` and `state/estcache {map}`; shared across devices.

### 5.9 Row states (`src`)

| src | Meaning | Counts as needing numbers |
|---|---|---|
| `table` | Built-in table | no |
| `claude` | Claude estimate | only if kcal and p both 0 |
| `you` | Edited by hand, or cache record `by:"you"` | no |
| `label` | From a nutrition label | no |
| `pending` | Waiting on Claude (in memory only) | no |
| `none` | No numbers (Claude unreachable or failed) | yes |

`renderFood` turns any `pending` row into `none` when no estimate is running (`!foodBusy`). Bulk "Ask Claude for all N" (`bulkAsk`) re-estimates every `needsNumbers` row of TODAY in one call, matching replies by position, and updating the same row objects only if they are still in that day's array (`ef.indexOf(row) >= 0`).

Edit panel: "Ask Claude again" decides what to price: if the label box still equals the label the last estimate wrote, re-price the same description; else if the box differs from the row label, price the box; else price `r.raw`. Save: unchanged numbers keep the old `src`; numbers equal to the last Claude fill give `claude`; anything else gives `you` and calls `rememberFood`.

### 5.10 Async safety in `addFood` and `bulkAsk`

- The day key is captured (`fk = TODAY`, `bk = TODAY`) before the call. Results are written into the captured row objects, then `syncFoodToDay(fk)` and `persist(false, fk)`. Navigating to another day mid-call does not misplace results.
- A row deleted while Claude was answering is skipped (identity check against the day's current array).
- Only one food estimate runs at a time (`foodBusy` disables Add).

### 5.11 Label scan (`scanLabel`, `runScan`, `showLabelConfirm`, `logLabelFood`)

- Photo mode only if `sampler.limits()` reports `images`; otherwise the same button opens the manual per-100 g form (`showManualLabel`), which requires grams eaten and kcal.
- Reply must be an object with `per100` and no `error`. Values pass `num()` (finite and >= 0, else 0). Default grams = `serving_g || 100`. Name max 80.
- `logLabelFood(name, per, g)`: new meal number; row `{label: name+" ("+g+" g <U+2014> from label)", kcal..fib = per*g/100, src:"label", raw:name, meal}`; caches `v2:canonName(name)` as above.

### 5.12 Plate photo (`runPlate`, `showPlateConfirm`)

- Only shown when images are allowed. Up to 8 items; items with grams <= 0 are dropped. User can untick items and correct grams.
- Rows: `{label: name+" (G g, from photo)", values per100*G/100, src:"claude", raw: name+" "+G+" g"}` logged together as one meal via `addMealRows`. Not cached.

### 5.13 Meals, saved meals and one-tap logging

- Every Add (typed, label, plate, quick card) gets `meal = max(existing meal)+1` for that day. Legacy rows without `meal` render ungrouped with no subtotal.
- Subtotal per meal; fat cell flagged when a meal exceeds 20 g.
- `mealsOf(k)` groups consecutive rows with the same `meal`, skipping pending, needs-numbers and unnumbered rows. `mealSig(rows)` = `shortFoodLabel(label)` joined by `" + "` (portion is part of the label, so 2 eggs and 3 eggs differ).
- `recentMeals()`: last 21 days back from MAXDAY (stopping at START), grouped by signature, sorted by count then most recent. Quick cards show all saved meals plus up to 6 recent ones not already saved.
- Saved meal: `{id, name (max 30), sig, rows: rowCopy[]}`, newest first, max 12 (`goa:meals`, `state/meals {list}`).
- `addMealRows(rows, label)`: blocked on future days; copies rows (`rowCopy` keeps label, numbers, src (default `you`), raw) with a new meal number; Undo removes exactly those row objects from the captured day.

### 5.14 Day totals: `syncFoodToDay(k)` and `collect()`

```
if day has no food rows: delete e.kcal, e.protein
else: e.kcal = round(Σ kcal), e.protein = round(Σ p)
```

Carbs, fat and fiber are never stored as day totals; they are re-summed from rows (`dayNutrient`). A day with no rows keeps any typed kcal/protein (backfilling old days). `collect()` reads the weight, steps, sleep and waist inputs into `entries[TODAY]` (empty input deletes the field) and recomputes kcal/protein from rows if any.

Display rules: day total kcal is "hit" if `<= P.kcal + 100`, protein "hit" if `>= P.protein - 10`, fiber "hit" if `>= 30`. The 14-day table uses the same kcal and protein margins, steps `>= P.steps`, sleep `>= 7`.

Kcal chart metrics (`KMETRIC`): kcal ceiling margin 100 (target `plan(k).kcal`); protein floor margin 15 (target `plan(k).protein || 180`); carb ceiling 30, fat ceiling 12, fiber floor 6 (targets from `PL.targets`). A day "misses" when `eaten > target + margin` (ceiling) or `eaten < target - margin` (floor).

---

## 6. Habits

### 6.1 Definitions

`{id, name (max 40), type:"build"|"limit", unit, goal, step}` (`goa:habits`, `state/habits {list}`). First run seeds `gaming` (limit 2 h, step 0.5) and `walk` (build 10 min, step 5). `normUnit` maps h/hr/hrs/hour/hours to `h` and min/mins/minute/minutes to `min`. Units offered: min (step 5, goal 20), h (0.5, 1), times (1, 1), steps (500, 8000), glasses (1, 8), L (0.5, 3), pages (5, 10), km (0.5, 2), g (10, 100), or a custom unit (step 0.5 for h, 5 for min, else 1).

Values: `entries[k].habits[id] = number >= 0`; empty deletes it.

### 6.2 Semantics

| Function | build | limit |
|---|---|---|
| `habitMet(h, v)` | `v != null && v >= goal` | `v != null && v <= goal` |
| `dayMet(h, v)` (past days) | unlogged = miss | unlogged = met |
| `habitStreak` | Counting back from MAXDAY: if today is logged and met, +1; logged and missed returns 0; unlogged today is skipped. Then each earlier day must be logged and met. | same, using `habitMet` (so an unlogged limit day ends the streak) |
| `habitLongest` | Longest run of logged-and-met days from START to MAXDAY; today skipped if unlogged | same |
| `habitStrength` | EMA from 50 with `alpha = 0.22`: `s += 0.22*(target - s)`, target 100 if met else 0, over START..MAXDAY; today skipped if unlogged; unlogged past build days count as 0 | unlogged days skipped |
| `habitPct` | Days START..yesterday; met/eligible | only logged days are eligible; uses `dayMet` |

Strength colors: >= 70 ok, >= 40 warn, else low.

Today bar (`dailyBarHTML`): build fills to goal. Limit fills a budget: ratio `v/goal`; >1 over (red), >= 0.75 warn (amber), else ok.

`tracksSteps(h)`: build habit whose id is `walk` or name matches `\b(steps?|walk)\b`. It edits `entries[k].steps` with two wheels (thousands 0 to 30000 and fifties 0 to 950).

### 6.3 Timers (`runTimers`, per device)

State per habit id: `{running, startedAt, accumMs, day, segs:[{s,e}]}` in `goa:timers` (localStorage only, not synced).

- Only time units (`h`, `min` spellings) get a timer.
- `startTimer(id)`: pauses any other running timer first (one clock at a time). New timer records `day: TODAY` (the browsed day). Requests the screen wake lock.
- `pauseTimer`: adds the running span to `accumMs` and pushes a segment.
- `timerMs(id) = accumMs + (running ? now - startedAt : 0)`.
- `stopTimer(id)`: closes focus view if open; releases wake lock if nothing else runs; `k = timerDay(id)` (the start day, even after midnight); segments (plus the live one) appended to `entries[k].hlog[id]` sorted by start; value added: `nv = round(existing + ms/unitMs, dec)` with `unitMs` 3,600,000 for hours (2 decimals) or 60,000 for minutes (0 decimals). If `k` is the browsed day it uses `setHabitVal`, else it writes that day and calls `persist(false, k)` and shows a toast naming the day.
- `resetHabitToday(id)`: cancels a timer belonging to the browsed day, deletes that day's `hlog[id]`, clears the value.
- Deleting a session segment subtracts its duration from the value (with Undo).
- "Entered by hand" line = value minus timed segments, shown when >= 1 minute.
- Clock modes per habit (`goa:tmode`): up (session time) or down (left = `goal*unit - logged*unit - timerMs`).
- `checkClockAlert`: when a running session crosses the goal or cap (and the day was not already past it before this session), chime once, vibrate `[200,100,200]`, toast. Reset when time left becomes positive again.
- A single 1 s interval drives every live clock, Pomodoro and focus view.

### 6.4 Pomodoro

`pomo = {phase:"idle"|"work"|"break", running, endsAt, remainMs, workMin:25, breakMin:5, targetId, cycles}` in `goa:pomo`.

- Target habit: `pomo.targetId` if it exists, else the first build habit with a time unit whose name matches `/focus|work|study|read|deep|learn|write|code/i`. "Add a focus habit" creates `Deep work` (build, min, goal 60, step 15).
- `pomoTick`: at the end of a work block: `logFocus(workMin)`, `cycles++`, chime, switch to break. At the end of a break: chime, switch to work. Loops until stopped.
- `pomoStop` during work logs the minutes done: `workMin - ceil(remaining/60000)` if > 0. `pomoReset` discards.
- `logFocus(min)`: jumps to MAXDAY (`ensureToday`), adds a segment ending now, and adds `min/60` (hour habits, 2 decimals) or `min` to today's value.
- Settings: work 1 to 120 min, break 1 to 60 min. `cycles` is never reset per day in code even though the UI says "blocks today".

### 6.5 Keystone

`keystoneId` (`goa:keystone`, `state/keystone {id}`); `getKeystone()` falls back to the first build habit, then the first habit. In r14 it only draws a star and moves no logic: the "earned reward" gate described in comments is not implemented, and the sections that used it (`renderTonight`, `renderHabitSummary`) return early.

### 6.6 `habitsHitPct()`

Over every habit and every day START..MAXDAY: skip today if unlogged, skip unlogged limit days, otherwise count; hit when `habitMet`. Returns rounded percent or `null`.

---

## 7. Consistency, streaks, calendar, nudges

### 7.1 `dayState(k)` (sessions)

```
pl = plan(k)
!pl.inRange          -> "out"
k > MAXDAY           -> "future"
pl.type == "rest"    -> entry ? "restlog" : "rest"
done = checks.train
       || (lift   && any exercise has filled sets)
       || (cardio && steps >= pl.steps)              // the full phase target
done                 -> "done"
k == MAXDAY          -> "pending"
else                 -> entry ? "partial" : "missed"
```

### 7.2 `streaks()`

Loop `i = 0 .. min(TOTAL-1, diffDays(START, MAXDAY))` over the goal timeline:

- `logged++` if an entry exists.
- Rest days are skipped (never break a streak).
- Not in range of the training timeline: intended to count a done session but never breaks the run (see Possible bugs: `dayState` returns "out" there, so the "done" branch never fires).
- Otherwise `sched++`; done gives `done++, run++, best = max`; not done and not today gives `missed++, run = 0`. Today pending does not break the run.

Returns `{cur, best, done, sched, missed, logged, upto}`.

### 7.3 Per-item states and day score (calendar, week strip, dots)

`itemState(id, k)`:

| Item | Rule |
|---|---|
| workout | `plan(k).type != "lift"` gives `rest` (excluded); trained (`checks.train` or any filled set) gives `met`; today gives `pend`; else `miss` |
| food | food rows or `kcal > 0` gives `met`; today `pend`; else `na` |
| step-tracking habit | met if `v >= goal` or `steps >= WALK_MIN (2000)`; nothing logged gives `pend` (today) or `na`; else `pend`/`miss` |
| other habit | unlogged `na`; limit: `met` if `v <= goal` else `over`; build: `met` if `v >= goal`, else `pend` (today) or `miss` |

`dayScore(k)`: over workout, food and every habit: skip `rest`; skip `na` for limit habits; `due++`; `logged++` unless `na`; `hit++` if `met`.

`dotState(k)` (week strip and Today grid):

```
outside START..END -> "out";  k > MAXDAY -> "future"
no logged item and not (lift day with workout met) -> today ? "pend" : "empty"
p = hit/due:  p>=1 "full", p>=0.5 "most", p>0 "some", else today ? "pend" : "none"
```

The Progress calendar uses the same thresholds (`k-full`, `k-most`, `k-some`, `k-none`, `k-empty`, `k-pend`) for the Overall filter, or per item (`k-met`, `k-miss`, `k-over`, `k-empty`, `k-rest`, `k-pend`). Month navigation is clamped to the goal's months; a swipe over 45 px horizontally (and 1.4x the vertical move) changes month. Footer counts "full days" (`hit >= due`) out of days up to MAXDAY.

`cellState` (an older two-goal walk/workout classifier) is defined but never called.

Today "Consistency" card (`renderConsist`): 28 pills from the Monday three weeks before this week's Monday; current streak (or best); this calendar week's scheduled non-rest sessions (Monday to Sunday, future ones count as due) and how many are done; `habitsHitPct`.

Logging streak chip (`renderFuel`): consecutive days ending at MAXDAY with any entry object.

### 7.4 Nudges (`missStats`, `renderNudge`)

- `dayActive(k)`: trained or `steps >= 2000`.
- `since`: days since the last active day up to MAXDAY (or `upto+1` if none).
- `run`: consecutive non-active scheduled (non-rest) days ending **yesterday**, stopping at the first day outside the training range.
- Show if `run >= 2 || since >= 3`, unless dismissed today (`goa:nudgeoff == REAL`). "Hard" tone if `run >= 4 || since >= 6`; strongest copy if `since >= 8 || run >= 7`.
- Actions: log a walk (jump to today, Train, focus the steps field) or hide until tomorrow.

### 7.5 Quote rotation

`LINES` (quotes with authors). A shuffled deck (Fisher-Yates) excluding the current quote; the last `min(10, floor(n/4))` shown quotes are moved to the front of the deck and the deck is drawn from the back, so recent ones come last. Auto-rotates every 180,000 ms (3 minutes); the button advances and restarts the timer. `fillLine` substitutes `{start}`, `{target}`, `{due}`, `{goal}` (no current quote uses them).

### 7.6 Checklist (`checkList(p)`)

Built-ins, then sorted by `WHEN_RANK` of the `w` label (waking 0, morning 1, breakfast 2, all day 3, meals 4, daytime 5, lunch 6, afternoon 7, session 8, after 9, anytime 10, evening 11, dinner 12, bedtime 13, night 14; unknown 10), ties by insertion order:

| id | When | Condition |
|---|---|---|
| waist | Waking | `p.waistDay` |
| photos | Waking | `p.dow == 6 && p.week % 4 == 0` (last day of every fourth training week) |
| water | All day | always; "Water, about {PROFILE.waterL or 3} L" |
| protein | Meals | always; "{p.protein} g protein" |
| lab / task | Daytime | milestone on that day |
| mobility + train | Session | lift day ("Lift: {NAMES[session]}") |
| train + mobility | Session / After | cardio day ("Cardio session") |
| mobility | Anytime | rest or off day |
| sleep | Night | always |

User checks (`userChecks`): an item whose `id` matches a built-in overrides its `t`, `w`, `s`; otherwise it is appended as custom (unless `builtinOnly`). `hiddenChecks[id]` hides any check. Ticks: `entries[k].checks[id] = bool`.

---

## 8. Workout session mode

State `wo = {day, session, start (ms), idx, done?}` in `goa:wo` (local only). Rest length `woRestLen` 90 s default, allowed 30 to 300, choices 60/90/120/180 (`goa:rest`).

```
openWorkout(): only on lift days and not the future.
  if no wo, or wo.day != TODAY, or wo.session != P.session, or wo.done:
      wo = {day:TODAY, session:P.session, start:now, idx: first exercise not exDone (or 0)}
  show overlay, lock body scroll, request wake lock, tick every 250 ms
```

Per exercise view (`woCur`, `renderWo`): `n = max(setCount, logged sets, setShow[nm])`; `next` = first set without reps. The editor shows the selected set (`woSel`) or `next`. Prefill: that set's values, else the previous set's load, else the suggestion (`woSuggest`), band default 1.

Actions (`woClick`):

| Action | Effect |
|---|---|
| log | Requires reps > 0. Writes `r`, plus `w` (weight kind, empty if not positive) or `b` (band kind). `queueSave()`. PR toast and 60 ms vibrate if a new best. Starts rest. |
| clear | Clears r, w, b of that set. |
| addset | `setShow[nm] = n+1` and selects it. |
| prev / next | Move between exercises; `next` past the last goes to the summary (`idx = L.length`). |
| finish | Jump to summary. |
| back | `idx = 0`. |
| done (Save and close) | `checks.train = true`, cancel any pending debounce and `persist(false)` immediately, `wo.done = true`, clear rest, close. |
| close (minimise) | Hides overlay; keeps ticking only while a rest is counting down; releases wake lock if no habit timer runs. |
| rest controls | length buttons reset a running countdown to the new length; +15 s extends; Skip clears. |

Rest timer: `woRestEnd = now + len*1000`. On expiry: chime, vibrate `[180,90,180]`; if minimised, also a toast "Rest over. Next set." and the tick stops. The visible rest card disappears 60 s after expiry.

Summary: time since `wo.start`, sets with reps, exercises with any set, volume vs `lastSameSession`, new bests (today's best > best before today).

Wake lock (`reqWake`/`relWake`): requested by habit timers and session mode, released when nothing needs it. It is not re-requested after the page is hidden and shown again.

---

## 9. Claude features, prompts and safety

### 9.1 Runtime APIs

`window.claude.use("sample")` returns an object used as `sampler.json(prompt, options)` (resolves to parsed JSON) and `sampler.limits()` (resolves to `{images: bool, ...}`). The app wraps it (section 11.6). Error codes handled by `claudeErr`: `not_granted`, `sampling_disabled`, `rate_limited`, `invalid_json`, `timeout`, `image_rejected`; anything else is "Could not reach Claude just now."

`withTimeout(ms, promise)` rejects with `{code:"timeout"}`.

| Feature | Function | Options | Timeout |
|---|---|---|---|
| Food estimate | `askClaude` | `{modelTier:"default", cache:true}` | 45 s |
| Label scan | `runScan` | `{images:[file], modelTier:"default"}` | none |
| Plate photo | `runPlate` | `{images:[file], modelTier:"default"}` | none |
| Plan builder | `askPlan` | `{modelTier:"complex"}` | 180 s |
| Weekly review | `runReview` | `{modelTier:"default"}` | 120 s |

No other Claude calls exist.

### 9.2 Food estimate prompt (`askClaude`)

`{CUISINE_PART}` is `"<PROFILE.cuisine> food, "` when set, else empty. Descriptions are numbered from 1.

```
You estimate nutrition for {CUISINE_PART}home cooking and restaurants.
For each description work out what the dish actually is, including anything mixed into it; do not reduce a composite dish to its main ingredient. Give values PER 100 g of the COOKED, ready-to-eat food (per 100 ml for drinks). Also give serving_g: the weight in grams of ONE piece when the food is counted in pieces (one roti, one egg, one idli), otherwise a typical single serving. The page multiplies it by any count in the description. For a DISH whose description lists its ingredients (a salad, bowl, wrap, smoothie), price the whole dish as eaten, dressings included, and make serving_g the total weight of everything listed. Do NOT put any weight in the name.

Reply with ONLY a JSON array, one object per description, in the same order, shaped:
[{"name":"Fish tikka, boneless (grilled)","serving_g":200,"per100":{"kcal":150,"p":20,"c":3,"f":6,"fib":0.5}}]

Descriptions:
1. <description 1>
2. <description 2>
```

Validation: reply must be an array (else `invalid_json`). Each element needs an object with `per100`; missing elements leave that row with no numbers. The page, not Claude, multiplies by portion.

### 9.3 Label scan prompt (`runScan`)

```
This image is a photo of a packaged food's nutrition information panel (any country's format; values may be given per 100 g, per serving, or both). Read it and NORMALISE everything to PER 100 g (or per 100 ml). If only per-serving values are printed, use the serving size to convert to per 100 g. Reply with ONLY a JSON object, no other text, shaped:
{"product":"<name, or best guess>","serving_g":<grams in one serving, or null>,"per100":{"kcal":<number>,"p":<protein g>,"c":<carbohydrate g>,"f":<fat g>,"fib":<fibre g>}}
Numbers only, no units. Use 0 for any value the label does not show. If the image is not a readable nutrition label, reply {"error":"no label"}.
```

Validation: object, no `error`, has `per100`; each value through `num()`. The user confirms name and grams before logging.

### 9.4 Plate photo prompt (`runPlate`)

`{CUISINE_PART}` is `", most likely <PROFILE.cuisine> food"` when set, else empty.

```
This is a photo of a meal{CUISINE_PART}. List each separate food you can see, including rice, rotis, gravies, sides, chutneys and drinks. Estimate the cooked weight of each in grams from the size of the plate, bowl or katori. Count visible oil, ghee or butter inside each dish's values. Give values PER 100 g of the cooked food.
Reply with ONLY JSON shaped: {"items":[{"name":"Dal tadka","grams":150,"per100":{"kcal":110,"p":5,"c":13,"f":4,"fib":3}}],"confidence":"low"|"medium"|"high"}
If there is no food in the photo, reply {"error":"no food"}.
```

Validation: object, no `error`, non-empty `items` array; first 8 items; name max 60; grams rounded, items with 0 g dropped; `confidence` shown only if low/medium/high.

### 9.5 Plan builder prompt (`askPlan`)

`{REQUEST}` is the user's text with every `"` replaced by `'` (max 600 chars typed). `{RULES}` is `planRules()` joined with `"\n- "`. `{DAY1}` is `planWeekdays()[0]` (for example "Mon"). `{CONTEXT}` is `JSON.stringify(ctx)` (below).

```
You are a strength coach revising one person's training plan. Change only what the request and the data justify, and keep everything else exactly as it is.

Request from the person: "{REQUEST}"

Hard rules:
- {RULE 1}
- {RULE 2}
- ...
- Keep exactly 4 phases. Each phase has "weeks": one or two arrays of exactly 7 day slots; day 1 is a {DAY1}. The second array is used on even weeks (that is how session A and B alternate); repeat the first if they are the same.
- A slot is {"t":"lift","s":"<program key>","c":"cardio after the session"}, {"t":"cardio","c":"what to do"} or {"t":"rest","c":"note"}.
- programs: {"<key>":{"name":"...","kit":"home"|"gym","ex":["Exercise name|3 × 8-10|one-line form cue"]}}. At most 8 exercises a session. For an exercise you keep, write only "Exercise name|sets × reps"; its cue is kept. Give a cue only for a new exercise.
- Keep program keys and exercise names unchanged unless you mean to change them: logged history is matched by exact name.
- Each phase has a daily "steps" target. targets holds carb, fat and fiber grams. Calories and protein go in "goal".

Reply with ONLY JSON, no other text, shaped:
{"summary":"one sentence on what you changed and why","changes":["short line","..."],"goal":{"kcal":2200,"protein":180},"plan":{"programs":{...},"targets":{"carb":200,"fat":65,"fiber":33},"phases":[{"name":"...","steps":8000,"detail":"...","weeks":[[...7 slots...],[...7 slots...]]}]}}

Context:
{CONTEXT}
```

`planRules()` produces, in order:

1. If a weight is known (latest, else START_KG): `"Current body weight about {w} kg[, height {h} cm][, age {age}]."`
2. If `PROFILE.jointFriendly`: `"Go easy on joints: no running, jumping or other high-impact work, and nothing that needs getting down onto the floor and back up."`
3. Each non-empty line of `PROFILE.rules` (the user's "Anything Claude must always respect", max 1200 chars).
4. `"Calories never below {kcalFloor()} a day; protein never below {proteinFloor()} g."`
5. `"Never give advice about medicines or doses."`

Context object:

```
{ today: MAXDAY, weekdayOfDay1: "Mon",
  goal: {name, start, end, startKg, targetKg, latestKg, lossPerWeekKg, kcal, protein},
  now:  {phase|null, week|null, phaseWeeks: TPHASE_W},
  lastWeek: weekStats(MAXDAY), weekBefore: weekStats(MAXDAY-7),
  plan: compactPlan(PL) }        // programs with ex lines as "name|scheme" (cues stripped), targets, phases
```

`weekStats(endK)` covers the 7 days ending `endK`, restricted to `[START, min(END, MAXDAY)]`: `from, to, daysInWeek, weightAvg (1 dec), weighIns, kcalAvg, foodDays (days with kcal > 0), proteinAvg (only from food days), stepsAvg, stepsDays, sleepAvg, liftDone/liftScheduled, cardioDone/cardioScheduled (steps >= target or checks.train), checksPct, habits [{name,type,goal,unit,met,of}] (limit unlogged and today unlogged skipped, `dayMet`), strength` (up to 10 exercises with this week's sets as text and the most recent earlier session within 70 days, not before START).

Response handling (`buildProposal`):

1. Must be an object with an object `plan`.
2. Each program's `ex` lines rebuilt as `name|scheme|cue`, with `cueFor(name)` filling a missing cue (current plan, then default plan, then the swap library).
3. `by:"claude"`, `at: now`, `note: request (80 chars)`; then `normPlan` (section 3.4). Failure gives `invalid_json`.
4. `kcal` accepted only in `[kcalFloor(), 4500]`, protein only in `[proteinFloor(), 320]`; otherwise the current value is kept silently.
5. `summary` max 240, up to 6 `changes` max 160 each (Claude's description, shown as is).
6. `planDiff` computes the real changes from the two plans (kcal, protein, carb/fat/fiber, per-phase steps, lifting days per week, changed day slots for both weeks (up to 4 listed), added/dropped exercises, scheme changes, renamed/new/removed sessions). "Use this plan" is offered only if the diff is non-empty.

Accept (`acceptProposal`): sets `G.kcal`, `G.protein`, `saveGoals()`, `savePlan(plan, before)` (stores the old plan and old kcal/protein in `planPrev`), toast with Undo (`restorePrevPlan`).

### 9.6 Weekly review prompt (`runReview`)

`{GTYPE}`: `lose` "fat-loss", `recomp` "body-recomposition", `muscle` "muscle-building", `health` "health and habits", otherwise "fitness". `bulk = (G.type == "muscle")`. `{FLOOR}` = `kcalFloor()`. `{DATA}` = `JSON.stringify(data)`.

```
You are reviewing one week of a {GTYPE} plan for one person, using only the numbers below. Be specific and plain. No cheerleading, no shaming, no emoji.

Rules for the suggestion:
- Suggest at most ONE change for next week.
{LINE A}
{LINE B}
- Do not comment on medicine or doses. If the numbers suggest they are unwell (very low food, no sleep), say to check with their doctor.

Reply with ONLY JSON shaped:
{"headline":"one-sentence verdict on the week","wins":["..."],"watch":["..."],"focus":"the one thing to do next week","suggestion":{"what":"...","why":"...","change":{"kcal":2050} or {"steps":10000} or null}}
wins and watch have at most 3 items each, under 18 words each, and cite the numbers.

Data:
{DATA}
```

Line A, bulk: `- A calorie increase is 100 to 200 kcal, only if weight has not risen for two weeks. A step change is 1,000 to 2,000 a day. Never cut protein.`
Line A, otherwise: `- A calorie cut is 100 to 200 kcal and never takes the target below {FLOOR}. A step increase is 1,000 to 2,000 a day. Never cut protein.`
Line B, bulk: `- Only suggest a change if food was logged on at least 5 of the 7 days. Otherwise change is null and the suggestion is about consistency.`
Line B, otherwise: `- Only suggest a calorie or step change if the 7-day average weight has not dropped compared with two weeks before AND food was logged on at least 5 of the 7 days. Otherwise change is null and the suggestion is about consistency (logging, sessions, sleep or protein).`

Data object: `{week: weekStats(MAXDAY), weekBefore: weekStats(-7), twoWeeksBefore: {weightAvg, weighIns} of weekStats(-14), targets: {kcal, protein, steps} of plan(MAXDAY), goal: {name, startKg, targetKg, end, lossPerWeekKg}, phase: phase name or null, weekOfPlan}`.

Validation (`normReview`): needs an object with `headline`. Wins/watch: up to 3, 200 chars each. Headline 240, focus 240, what 200, why 300. The suggested change is kept only if:

- `kcal`: `foodDays >= 5` and, for muscle, `G.kcal < v <= G.kcal + 250`; otherwise `kcalFloor() <= v < G.kcal` and `v >= G.kcal - 250`.
- `steps` (only checked when no `kcal` key): rounded to 100; `pl.steps < v <= pl.steps + 2500`.
- Anything else becomes `change: null`. The app never applies a protein change from a review.

Stored as `lastReview = {id: MAXDAY, at, from, to, stats, out, applied:false}` (`goa:review`, `reviews/{id}`). `reviewDue()`: Claude available, at least 6 days since START, and no review or the last one's `to` is 7+ days before MAXDAY.

Apply (`applyReviewChange`, once): kcal sets `G.kcal`. Steps: with a saved plan, every phase from the current one onward moves by `delta = new - plan(MAXDAY).steps` (floor 2000) and is saved as a `you` plan with note "Steps raised after a weekly review"; without a saved plan `G.steps += delta`.

### 9.7 Safety rules summary

| Rule | Where enforced |
|---|---|
| Calorie floor | Prompt rule (plan and review); `buildProposal` kcal range; `normReview` kcal range; plan target editing range |
| Protein floor, never cut protein | Plan prompt rule; `buildProposal` protein range; review prompt says never cut and `normReview` ignores protein entirely |
| Medicines and checks | Claude's response has no field that can touch checklist items, milestones or user checks; the plan prompt says "Never give advice about medicines or doses"; the review prompt says not to comment on medicine and to refer to a doctor. Medicines live only in user checks (`userChecks`), which no Claude path reads or writes. |
| User rules | `PROFILE.rules` lines and the joint-friendly rule are injected verbatim as hard rules in the plan prompt (not in the review prompt) |
| Bounded changes | Only one review change, within +-250 kcal or +2500 steps; plan structure validated by `normPlan`; proposals require explicit acceptance; previous plan always restorable |
| Food numbers | Claude only returns per-100 g values; portions are computed by the app; estimates are visibly tagged "estimate" |

---

## 10. Reminders (Google Calendar)

Uses `window.claude.use("mcp")` then `mcpApi.callTool("Google Calendar", tool, args)`. State `remState = {items:{key:{on,time}}, events:[{k,id,title}], tag, at}` (`goa:rem`, `state/reminders`).

### 10.1 Rows (`remRows`) and defaults

| Key | Label | Default |
|---|---|---|
| `train` | Training days (weekdays with any lift slot in the current phase) | 18:30, on |
| `chk:<id>` | Each check from `checkList(plan(MAXDAY))` except `waist, photos, lab, task, mobility, train, protein, water` (in practice `sleep` plus user checks) | time from `REM_TIME[when]` (waking 07:00, morning 08:00, breakfast 07:30, lunch 13:00, afternoon 16:00, evening 20:00, dinner 20:30, bedtime 22:30, night 22:45), else 09:00; off |
| `dates` | Bloods and milestones on or after MAXDAY | on, no time (fixed 08:00), disabled if none |
| `review` | Weekly review on `wn[6]` (the 7th plan weekday) | 19:00, on |

### 10.2 Events created (`remEvents`)

Times are local wall-clock strings `YYYY-MM-DDTHH:MM:00` (`localStamp`), no time zone. `today = max(MAXDAY, START)`. `firstOnOrAfter(k, mins, ok)`: starts tomorrow if `k == MAXDAY` and the time already passed today, then the first of the next 14 days that satisfies `ok`. `UNTIL` = 23:59:59 device-local on the end day converted to UTC basic format (`untilOf`). Every description ends with `"\n\nAdded by Recomp (<tag>). Change or remove it there, not here."`.

| Kind | summary | start / end | recurrence | other |
|---|---|---|---|---|
| Training, one per phase still ahead | `"Lift · <phase short name>"` | first matching weekday on or after `max(phase start, today)` at the chosen time; 60 min | `RRULE:FREQ=WEEKLY;BYDAY=<days>;UNTIL=<phase end>` | description lists each lift weekday with session names, "(odd weeks) / (even weeks)" when they differ, plus "Open Recomp, Train, Start session."; popup at 0 min |
| Check | check title | first day at time; 10 min | `RRULE:FREQ=DAILY;UNTIL=<END>` | `availability: AVAILABILITY_FREE`, popup 0 |
| Milestone | `"Bloods: "` or `"Milestone: "` + text up to the first U+2014 or `.`, max 70 | 08:00 to 08:30 on the day | none | popups at 0 and 840 min (6 pm the day before), free |
| Review | `"Weekly review · Recomp"` | first `TSTART+6` weekday at the time; 15 min | `RRULE:FREQ=WEEKLY;BYDAY=<day>;UNTIL=<END>` | free, popup 0 |

Phase date ranges come from the training timeline: `a = TSTART + (w0-1)*7`, `b = TSTART + min(TTOTAL-1, w1*7-1)`; phases ending before today are skipped.

### 10.3 Sync and removal

- `remSync()`: if events exist, `remRemoveAll(false)` first and only continue on success. Then new tag `"ft-" + Date.now().toString(36)`, build the list, create events one at a time (`seqDo`), saving `remState.events` after each success (so a partial run is recorded). Event id from `res.payload.id` or `res.payload.event.id`.
- `remRemoveAll(loud)`: if any stored event lacks an id, `list_events` with `fullText: tag`, `startTime: MAXDAY 00:00`, `endTime: END 23:59`, `pageSize: 250`, adding `recurringEventId || id`. Then `delete_event {eventId, notificationLevel:"NONE"}` for each, sequentially. Errors whose message matches `/not.?found|410|404|deleted/i` are ignored. On full success: `events = []`, `at = null`.
- Only events created by this page are ever deleted (by stored id or by the tag).
- `calErr` maps `server_not_connected`, `server_not_found`, `needs_reauth`, `consent_required`, `approval_required`, `not_granted`, `cancelled`, `blocked_by_policy`, `rate_limited`.

---

## 11. Sync and persistence

### 11.1 Day entry shape (`entries[k]`)

```
{ w, steps, sleep, waist, kcal, protein, note,
  checks: {<checkId>: bool},
  sets:   {<exercise name>: [{w?, r?, b?}]},
  food:   [{label, kcal, p, c, f, fib, src, raw, meal}],
  habits: {<habitId>: number},
  hlog:   {<habitId>: [{s: ms, e: ms}]} }
```

### 11.2 Stores

- localStorage: one key per day `goa:YYYY-MM-DD`, plus `goa:profile, goa:goals, goa:plan, goa:planprev, goa:swaps, goa:userchecks, goa:hiddenchecks, goa:bands, goa:habits, goa:keystone, goa:estcache, goa:meals, goa:rem, goa:review` (synced data) and device-only `goa:timers, goa:pomo, goa:tmode, goa:wo, goa:rest, goa:cue, goa:warm, goa:prog, goa:range, goa:metric, goa:kcalrange, goa:kcalmetric, goa:calf, goa:view, goa:theme, goa:nudgeoff, goa:acc:*`.
- Boot reads each `goa:` key whose suffix is a day key in its own try/catch (one bad key must not abort the loop).
- Database (`window.claude.use("db")`): `log/<day>` (raw entry), `state/profile`, `state/goals {list}`, `state/plan {plan}`, `state/planprev`, `state/swaps {map}`, `state/userchecks {list}`, `state/hiddenchecks {map}`, `state/bands {names}`, `state/habits {list}`, `state/keystone {id}`, `state/estcache {map}`, `state/meals {list}`, `state/reminders`, `reviews/<endDay>`.
- On db connect each `state/*` doc is fetched once (not live) and replaces the local copy if valid. `state/plan` missing on the server triggers an upload of the local plan. Only `log` has a live listener.

### 11.3 Saving a day

```
persist(loud, kArg):
  k0 = kArg || TODAY;  e = entries[k0] || {}
  dirtyKey = k0; savePending = false
  localStorage["goa:"+k0] = JSON(e)
  db.doc("log/"+k0).set(e)  -> on success or failure: if dirtyKey == k0, dirtyKey = null

queueSave():                       // debounced 700 ms, for typing
  if a save is pending for a different day: clearTimeout, persist(false, pendingKey) now
  pendingKey = TODAY; dirtyKey = TODAY; savePending = true
  k = TODAY                        // captured, so the timer writes the day that was edited
  saveTimer = setTimeout(() => persist(false, k), 700)

flushSave(): if savePending: clearTimeout; persist(false, pendingKey || TODAY)
```

`flushSave` runs on `visibilitychange` to hidden, on `pagehide`, and at the start of every `goToDay`. Mutations that are not typing (`setHabitValCore`, food changes, `setDaySteps`, `stopTimer`) call `persist(false[, k])` directly with the correct day. "Save" buttons call `collect(); renderAll(); persist(true)`.

`dbSet(path, obj)` wraps `db.doc(path).set(dbEnc(obj))` in try/catch and `.catch`, so a refused write never stops rendering.

### 11.4 Live log listener and the `seenOnServer` rule

`db.collection("log").limit(1000).onSnapshot(snap)`:

1. For each doc: `incoming = snapData(doc)` (deep copy). A doc is "being edited" if `doc.id == dirtyKey`, or `doc.id == TODAY` and the snapshot or doc has pending writes.
   - Being edited: do not overwrite. Repair case only: if the server copy has food rows while the local copy has none **but still has kcal or protein** (orphaned totals from a stale snapshot), copy the server's food back and recompute kcal/protein.
   - Otherwise replace `entries[id]` only when `stableStr` (key-order-independent JSON) differs.
2. Deletion mirroring, only when the frame has no pending writes and at least one doc: for each local day key not in the snapshot, skip if it is `dirtyKey`, skip if it is TODAY and an input/textarea has focus. Then:
   - **Never seen on the server** (`!seenOnServer[k]`): it was logged locally (offline or a failed save). On the first snapshot only, if the entry is non-empty, upload it with `persist(false, k)`. Never delete it.
   - Seen before and now gone: deleted elsewhere, so delete locally and remove `goa:k`.
   - Then mark every doc in the snapshot as seen, and `firstLogSnap = false`.
3. Frames with pending writes are echoes of our own write: skip rendering (except a repair), set "synced".
4. Settled frames: if something changed, render the charts/table only while an input is focused, else `renderAll()`.

### 11.5 Frozen data

Values read from the Claude-app database and replies from Claude can be frozen; assigning to them throws in strict mode. Rules:

- `snapData(sn)`: `JSON.parse(JSON.stringify(sn.data()))` for every read.
- `clone(o)`: deep copy (returns `{}` on failure) for anything stored in app state.
- The sampler is wrapped in a plain object whose methods forward to the real ones and deep-copy any object a promise resolves to. A `Proxy` was rejected because a Proxy of a frozen object must return the exact original methods.

### 11.6 Nested-array encoding

The database refuses an array directly inside an array (plan weeks are arrays of 7-slot arrays; `TPHASE_W` style data too).

```
dbEnc(v): arrays map each element; an element that is itself an array becomes {__arr: dbEnc(element)}
          objects recurse; primitives pass through
dbDec(v): an object whose only key is "__arr" (an array) becomes dbDec(that array); otherwise recurse
```

Every `dbSet` encodes. Decoding is applied when reading `state/plan`, `state/planprev` and the latest review. `log/*` docs are written raw by `persist` (they contain no nested arrays) and not decoded.

### 11.7 Single instance

On boot, `window.__goaStop()` from a previous instance is called (clears its intervals and unsubscribes its listener) and a new one is registered. This prevents stacked timers and subscriptions when the host re-applies the script without a reload.

### 11.8 Backup, export, restore

Uses `window.claude.use("downloads").save({filename, data})`. File names use `MAXDAY` as the stamp.

Full backup `recomp-backup-<day>.json` (`backupObj`):

```
{app:"recomp", version:1, exportedAt, goals, plan: planSaved, planPrev, habits, keystone,
 userChecks, hiddenChecks, bands, swaps, savedMeals, estCache, reminders:{items}, profile,
 reviews: [all docs in "reviews" if db, else lastReview], entries: {<day>: entry} (day keys only, sorted)}
```

CSV files (quoted when a cell has `"`, `,` or newline; `"` doubled; trailing newline):

| File | Columns |
|---|---|
| `recomp-daily-<day>.csv` | `date, weight_kg, kcal, protein_g, carbs_g, fat_g, fiber_g, steps, sleep_h, waist_cm, plan, session_done, checks_done, checks_total`, then one column per habit `habit: <name> (<unit>)`, then `note`. Carbs/fat/fiber are rounded sums of food rows (blank if no `food` array). `plan` is the session name or the day type. `session_done` is "yes" or blank. |
| `recomp-food-<day>.csv` | `date, meal, item, kcal, protein_g, carbs_g, fat_g, fiber_g, source, what_you_typed` (kcal rounded, macros `trimNum`) |
| `recomp-sets-<day>.csv` | `date, session, exercise, set, weight_kg, band, reps_or_seconds` (band as its name) |

Restore (`restoreBackup`): accepts `app` of `recomp` or `fitness-tracker` with an `entries` object. Shows how many days will be replaced and that local-only days stay. Then: each backup day replaces the local day (local and db); local days not in the backup are kept; goals, habits (via `normHabits`), keystone, user/hidden checks, bands (`normBands`), swaps, saved meals, estimate cache, reminder items, profile are replaced when present; plan through `normPlan`; `planPrev` as is; reviews: the latest by `at` becomes `lastReview`, all are written to the db. Finally `refreshGoal()`.

---

## 12. Gotchas we hit in production

A rebuild must keep each of these fixes.

| # | Problem | Fix in r14 (where) |
|---|---|---|
| 1 | **Frozen DB and AI objects.** Snapshot data and Claude replies arrive frozen; `Object.assign` copied only the top level, so writing a tick into `checks` or `sets` threw and the tick was lost. | Deep copy every read (`snapData`, `clone`); wrap the sampler so resolved objects are deep-copied; never use a Proxy for this. |
| 2 | **Nested arrays.** The database refuses arrays inside arrays, so plan saves failed (and a throwing write once stopped the screen updating). | `dbEnc`/`dbDec` with `{__arr: [...]}`; `dbSet` catches both sync throws and rejections. |
| 3 | **Two-calendar index mix-ups.** The on-plan target used `P.idx` (training index) against the goal-indexed projection, pointing at the wrong day after a block restart. | Projection and weight series always index from `START` (`pidx` in `renderStats`); schedule always from `TSTART` (`plan`). Keep them separate types in a rebuild. |
| 4 | **Debounced save writing the wrong day.** A 700 ms timer that read `TODAY` when it fired wrote the edit into whatever day was on screen by then. | `queueSave` captures the day key; a pending save for another day is flushed before a new one starts; `goToDay` flushes; background/pagehide flushes. |
| 5 | **Async estimate landing on the wrong day or rows.** A Claude reply arriving after the user changed day, or after rows were deleted, was written into the wrong place. | Capture the day key and the exact row objects; on reply, write only rows still present in that day's array (`indexOf(row) >= 0`); `syncFoodToDay(fk)` and `persist(false, fk)` with the captured key. |
| 6 | **Snapshot pruning deleted local days.** Mirroring server deletions removed days that had simply never reached the server. | `seenOnServer`: delete locally only a day the server once held; upload never-seen local days on the first snapshot; never prune on pending or empty frames, the dirty day, or the day being typed in. |
| 7 | **Orphan modal backdrop.** A habit could be "open" while its timer ran; the running habit renders as a hero card without a sheet, but the backdrop still rendered and dimmed the page until reload. | `renderHabits` removes the backdrop whenever the open card has no `.hpanel`, and clears relocated sheets/backdrops from `<body>` on every render. |
| 8 | **Cached estimates ignoring counts.** Whole-portion results cached by full text made "2 eggs" and "4 eggs" (and different word orders) inconsistent or identical. | Cache per-100 g plus `serving_g` under a quantity-free, sorted-word key (`v2:` + `canonName`); scale every portion with `portionOf`/`scaleEst`; hand corrections without grams store one piece (`unitOnly`). |
| 9 | **"boneless" ignored by the matcher.** Leftover-word checks used substring matching, so "bone" was "covered" by "boneless", and split phrasings never reached multi-word keys. | `normFood` on both sides (drops with/and/of/in/a/an/the); whole-word leftover check against the entry name; dedicated "Chicken biryani, boneless" entry with longer keys; bone-in entries with explicit keys. |
| 10 | **Monday waist day tied to plan week.** The waist check followed the plan's day 1, so restarting a block moved it. | `waistDay` is a pure calendar weekday (`waistWeekday()`, default Monday). |
| 11 | Stale "today" overnight | `rollDay()` every minute and on visibility. |
| 12 | One bad localStorage key emptied the cache | Parse each key in its own try/catch. |
| 13 | Echo snapshots caused full re-renders (UI freezes on phones) | Compare with `stableStr` (sorted keys); skip rendering pending-write frames. |
| 14 | Foodless stale copy overwriting server food | Repair path in the snapshot listener (restore food when local has totals but no rows). |
| 15 | Stacked instances after hot re-apply | `window.__goaStop` teardown registry. |
| 16 | Timers across midnight | A timer belongs to the day it started (`timer.day`) and logs there when stopped. |
| 17 | Rebuilding inputs under an open mobile keyboard wedged Android browsers | Never re-render a section containing the focused input; keyboard-free wheels for habit values; `scheduleHabitRender` waits for focus and wheel spin to end. |
| 18 | Many AudioContexts | `chime()` closes its context when the tone ends. |

---

## Possible bugs (not fixed)

1. **Unreachable branch in `streaks()`.** `if(!pl.inRange){ if(st==="done") ... }` can never count anything because `dayState()` returns `"out"` for out-of-range days. Sessions done before a restarted block never count toward the streak or "done".
2. **Maintenance week uses two different week numbers.** `buildProj` flattens the goal-timeline `MAINT_W`; `plan()` adds +500 kcal at the training-timeline `TMAINT_W`. They differ whenever `trainStart != start`. Also the flat projection week applies to every goal type while the +500 kcal applies only to `lose`.
3. **`gNext` uses non-existent goal types.** It checks `type=="gain"` and `type=="maintain"`, but the types are `lose/recomp/muscle/health`. A `muscle`, `recomp` or `health` goal's next goal gets target `startKg - 8`.
4. **`canonName` drops "boneless".** The estimate cache key strips `boneless` (and `large/small/medium`), so boneless and bone-in versions of a Claude-priced food (for example fish tikka) share one cache entry, which partly reintroduces gotcha 9 for foods outside the table. Size words are also lost for counted items.
5. **`trainStart` is never updated by goal edits.** Changing the goal start under Me leaves `TSTART` at the old date: training can begin after the goal start, or before it (days before START are in the training range but cannot be browsed). No r14 UI restarts a block.
6. **Hard-coded personal text.** "Outside the 117-day window." (`renderToday`), "of 117" in the static HTML, "The plan starts on 7 September." (`renderFuel` floor tip), and "Measured every Monday" in the waist chart note although the waist weekday is configurable.
7. **Loss-only wording for gain goals.** Landing range `TARGET-1.5 .. TARGET+3.5` and `renderOutcome` ("kg down") assume a loss. `rateOfLoss` projections only show for a falling trend, so a gain goal always shows "trend is flat or up, no loss to project". `renderGoal` "Moved" shows no sign for a gain.
8. **Inconsistent defaults.** Protein falls back to 180 in `plan()`, `gSave`, `gNext`, `KMETRIC` and the plan view, but to 120 in `provisionalGoal`, `makePlan`, `proteinFloor` and `checkList`. Kcal falls back to 2200 in most places but 2000 in the provisional goal.
9. **`bulkAsk` error path** calls `syncFoodToDay()` and `renderFood()` without the captured day `bk` and does not persist; if the user changed day meanwhile it re-totals the browsed day, and the `pending` to `none` change on `bk` is not saved.
10. **Single `dirtyKey`.** The first-snapshot upload loop calls `persist(false, k)` for each local-only day, each overwriting `dirtyKey`; the day actually being edited can lose its "being edited" protection for the next snapshot. The log listener also caps at 1000 docs; beyond that, days are never "seen" and are re-uploaded on every boot.
11. **Chart vs comment.** `renderStats` says the chart "draws the seven-day average against this line", but `renderChart` plots raw daily weights only; the stat compares the 7-day average.
12. **Review step change applies differently.** With a saved plan only the current and later phases change; with the default plan `G.steps` changes, which shifts every phase.
13. **Review bounds wider than the prompt.** Prompt says 100 to 200 kcal and 1,000 to 2,000 steps; validation allows up to 250 kcal and 2,500 steps (and any decrease of 1 kcal). Probably intentional slack; flagging for a decision.
14. **Different "session done" thresholds.** `dayState` (streaks) needs the full phase step target on cardio days, while the calendar and dots count the walk at `WALK_MIN = 2000` steps.
15. **History ranges differ.** `lastFor` ("last time" and suggestions) only searches the current goal's timeline, while `bestBefore` (PRs) searches all days. After a new goal the first session shows "First time" but PRs still compare against old data.
16. **`renderFuel` counts across goals.** "sessions logged" counts every entry with `sets` keys in all of history; the logging streak counts any entry object, even an empty one.
17. **Stale error text.** `addFood` failure tells the user to use "Estimate with Claude", but the button is labelled "Ask Claude for all N".
18. **Keystone is cosmetic.** Comments describe a gate that unlocks a reward habit; nothing implements it (`renderTonight` and `renderHabitSummary` return early).
19. **Pomodoro `cycles` never resets** although it is shown as "blocks today". `logFocus` also forces navigation to today when a block completes.
20. **Progress photos tied to training week.** `photos` fires when `p.dow==6 && p.week%4==0`, so it moves on a block restart (the same class of issue that was fixed for waist). May be intentional.
21. **Health and recomp goals get cut rules in the review** (calorie cuts allowed, "fat-loss"-style rule B), and only `lose` gets the planned maintenance week. Confirm intended behavior.
22. **`cellState` and `CELL_LABEL` are dead code**, as is `WALK_MIN2`.
23. **Very short goals.** `phaseBounds` does not guarantee four non-empty, non-overlapping phases for fewer than about 4 weeks.
24. **Wake lock** is not re-requested when the page becomes visible again, so a running timer or session can let the screen sleep after a tab switch.
