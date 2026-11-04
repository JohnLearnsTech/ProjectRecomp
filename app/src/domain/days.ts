// Habits, consistency and progress, ported from recomp.html r19 (05-business-logic §4, §6, §7).
// Everything reads one `entries` map in r19's own day shape, so the logic stays line-for-line
// with the web app. lib/days.ts builds that map from the database for the goal window.
import { addDays, d, diffDays, key, shortDate, trimNum } from './dates';
import type { Engine } from './plan';
import { bandKg, filled, loadKind, type Band, type Set_ } from './training';

export type DayEntry = {
  w?: number; steps?: number; sleep?: number; waist?: number; note?: string;
  kcal?: number; protein?: number;
  food?: unknown[];                      // only the length is read here
  sets?: Record<string, Set_[]>;
  habits?: Record<string, number>;
  checks?: Record<string, boolean>;
};
export type Entries = Record<string, DayEntry>;
export type HabitDef = { id: string; name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number };

export const WALK_MIN = 2000;
export const HABIT_UNITS = [
  { v: 'min', l: 'minutes (timer)', step: 5, goal: 20 }, { v: 'h', l: 'hours (timer)', step: 0.5, goal: 1 },
  { v: 'times', l: 'times', step: 1, goal: 1 }, { v: 'steps', l: 'steps', step: 500, goal: 8000 },
  { v: 'glasses', l: 'glasses', step: 1, goal: 8 }, { v: 'L', l: 'litres', step: 0.5, goal: 3 },
  { v: 'pages', l: 'pages', step: 5, goal: 10 }, { v: 'km', l: 'km', step: 0.5, goal: 2 }, { v: 'g', l: 'grams', step: 10, goal: 100 },
];
export function normUnit(u: string) {
  u = String(u || '').trim();
  if (/^(h|hr|hrs|hour|hours)$/i.test(u)) return 'h';
  if (/^(min|mins|minute|minutes)$/i.test(u)) return 'min';
  return u;
}
export const isTimeUnit = (u: string) => /^(h|hr|hrs|hour|hours|min|mins|minute|minutes)$/i.test(String(u || '').trim());
export const unitMs = (u: string) => (/^(h|hr|hrs|hour|hours)$/i.test(String(u || '').trim()) ? 3600000 : 60000);
export const tracksSteps = (h: HabitDef) => h.type === 'build' && (h.id === 'walk' || /\b(steps?|walk)\b/i.test(h.name || ''));
export const habitMet = (h: HabitDef, v: number | null) => (v == null ? false : h.type === 'build' ? v >= h.goal : v <= h.goal);
export const dayMet = (h: HabitDef, v: number | null) => (h.type === 'limit' ? (v == null ? true : v <= h.goal) : v != null && v >= h.goal);
/** Hours read better as clock time: 2.25 h -> "2:15". */
export const fmtHours = (x: number) => { const m = Math.round(x * 60); return Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2); };

export type DaysCtx = {
  entries: Entries; engine: Engine; MAXDAY: string; habits: HabitDef[]; bands?: Band[] | null;
};

export function makeDays({ entries, engine, MAXDAY, habits, bands }: DaysCtx) {
  const { START, END, TOTAL, WEEKS_N, PROJ, START_KG, TARGET_KG } = engine.T;
  const plan = engine.plan, NAMES = engine.NAMES;
  const base = d(START);
  const kAt = (i: number) => key(addDays(base, i));
  const todayI = Math.max(0, Math.min(TOTAL - 1, diffDays(base, d(MAXDAY))));
  const habitById = (id: string) => habits.find((h) => h.id === id) || null;

  const habitVal = (k: string, id: string) => { const e = entries[k]; if (!e || !e.habits) return null; const v = e.habits[id]; return v == null ? null : +v; };
  function habitStreak(h: HabitDef) {
    let n = 0;
    const tv = habitVal(kAt(todayI), h.id);
    if (tv != null) { if (habitMet(h, tv)) n++; else return 0; }
    for (let i = todayI - 1; i >= 0; i--) { const v = habitVal(kAt(i), h.id); if (v != null && habitMet(h, v)) n++; else break; }
    return n;
  }
  function habitLongest(h: HabitDef) {
    let best = 0, run = 0;
    for (let i = 0; i <= todayI; i++) {
      const v = habitVal(kAt(i), h.id);
      if (i === todayI && v == null) continue;
      if (v != null && habitMet(h, v)) { run++; if (run > best) best = run; } else run = 0;
    }
    return best;
  }
  function habitStrength(h: HabitDef) {
    let s = 50; const alpha = 0.22;
    for (let i = 0; i <= todayI; i++) {
      const v = habitVal(kAt(i), h.id);
      if (i === todayI && v == null) continue;
      if (h.type === 'limit' && v == null) continue;
      s = s + alpha * ((habitMet(h, v) ? 100 : 0) - s);
    }
    return Math.round(s);
  }
  function habitPct(h: HabitDef) {
    let met = 0, elig = 0;
    for (let i = 0; i < todayI; i++) {
      const v = habitVal(kAt(i), h.id);
      if (h.type === 'limit' && v == null) continue;
      elig++; if (dayMet(h, v)) met++;
    }
    return elig ? Math.round((met / elig) * 100) : null;
  }
  function habitsHitPct() {
    let t = 0, hit = 0; const last = Math.min(TOTAL - 1, diffDays(base, d(MAXDAY)));
    habits.forEach((h) => {
      for (let i = 0; i <= last; i++) {
        const v = habitVal(kAt(i), h.id);
        if (i === last && v == null) continue;
        if (h.type === 'limit' && v == null) continue;
        t++; if (habitMet(h, v)) hit++;
      }
    });
    return t ? Math.round((hit / t) * 100) : null;
  }

  const anySets = (e: DayEntry) => !!e.sets && Object.keys(e.sets).some((nm) => filled(e.sets![nm] || []).length > 0);
  const trainedOn = (k: string) => { const e = entries[k]; return !!(e && ((e.checks && e.checks.train) || anySets(e))); };

  function dayState(k: string) {
    const pl = plan(k);
    if (!pl.inRange) return 'out';
    if (k > MAXDAY) return 'future';
    const e = entries[k];
    if (pl.type === 'rest') return e ? 'restlog' : 'rest';
    const done = !!(e && ((e.checks && e.checks.train) || (pl.type === 'lift' && anySets(e)) || (pl.type === 'cardio' && (+(e.steps ?? 0) || 0) >= pl.steps)));
    if (done) return 'done';
    if (k === MAXDAY) return 'pending';
    return e ? 'partial' : 'missed';
  }
  function streaks() {
    const lastIdx = Math.min(TOTAL - 1, diffDays(base, d(MAXDAY)));
    let run = 0, best = 0, done = 0, sched = 0, missed = 0, logged = 0;
    for (let i = 0; i <= lastIdx; i++) {
      const k = kAt(i), pl = plan(k), st = dayState(k), isToday = i === lastIdx;
      if (entries[k]) logged++;
      if (pl.type === 'rest') continue;
      if (!pl.inRange) { if (st === 'done') { done++; sched++; run++; if (run > best) best = run; } continue; }
      sched++;
      if (st === 'done') { done++; run++; if (run > best) best = run; }
      else if (!isToday) { missed++; run = 0; }
    }
    return { cur: run, best, done, sched, missed, logged, upto: lastIdx };
  }

  type ItemSt = 'met' | 'miss' | 'over' | 'na' | 'rest' | 'pend';
  function itemState(id: string, k: string): ItemSt {
    if (id === 'workout') { const pl = plan(k); if (pl.type !== 'lift') return 'rest'; if (trainedOn(k)) return 'met'; return k === MAXDAY ? 'pend' : 'miss'; }
    if (id === 'food') { const ef = entries[k]; const ate = !!(ef && ((ef.food && ef.food.length) || +(ef.kcal ?? 0) > 0)); return ate ? 'met' : k === MAXDAY ? 'pend' : 'na'; }
    const h = habitById(id); if (!h) return 'na';
    const v = habitVal(k, id);
    if (tracksSteps(h)) {
      const stp = +(entries[k]?.steps ?? 0) || 0;
      if ((v != null && v >= h.goal) || stp >= WALK_MIN) return 'met';
      if (v == null && !stp) return k === MAXDAY ? 'pend' : 'na';
      return k === MAXDAY ? 'pend' : 'miss';
    }
    if (v == null) return 'na';
    if (h.type === 'limit') return v <= h.goal ? 'met' : 'over';
    return v >= h.goal ? 'met' : k === MAXDAY ? 'pend' : 'miss';
  }
  const calItems = () => [{ id: 'workout', name: 'Workout' }, { id: 'food', name: 'Food log' }].concat(habits.map((h) => ({ id: h.id, name: h.name })));
  function dayScore(k: string) {
    let due = 0, hit = 0, logged = 0;
    calItems().forEach((it) => {
      const st = itemState(it.id, k); if (st === 'rest') return;
      if (st === 'na') { const hh = habitById(it.id); if (hh && hh.type === 'limit') return; }
      due++; if (st !== 'na') logged++; if (st === 'met') hit++;
    });
    return { due, hit, logged };
  }
  function dotState(k: string) {
    if (k < START || k > END) return 'out';
    if (k > MAXDAY) return 'future';
    const sc = dayScore(k);
    if (!sc.logged && !(plan(k).type === 'lift' && itemState('workout', k) === 'met')) return k === MAXDAY ? 'pend' : 'empty';
    const p = sc.due ? sc.hit / sc.due : 0;
    return p >= 1 ? 'full' : p >= 0.5 ? 'most' : p > 0 ? 'some' : k === MAXDAY ? 'pend' : 'none';
  }
  function itemValTxt(id: string, k: string) {
    if (id === 'workout') { const pl = plan(k); return pl.type === 'lift' ? (trainedOn(k) ? NAMES[pl.session!] : k === MAXDAY ? 'not yet' : 'skipped') : 'rest day'; }
    if (id === 'food') {
      const ef = entries[k] || {}, n = (ef.food || []).length, kc = Math.round(+(ef.kcal ?? 0) || 0);
      return n || kc ? (kc ? kc.toLocaleString('en-US') + ' kcal' : '') + (n ? (kc ? ' · ' : '') + n + ' item' + (n > 1 ? 's' : '') : '') : 'not logged';
    }
    const h = habitById(id), v = habitVal(k, id); if (!h) return '';
    if (tracksSteps(h)) {
      const stp = +(entries[k]?.steps ?? 0) || 0;
      const mins = v == null ? '' : trimNum(v) + ' / ' + trimNum(h.goal) + (h.unit ? ' ' + h.unit : '');
      if (!mins && !stp) return 'not logged';
      return mins + (stp ? (mins ? ' · ' : '') + stp.toLocaleString('en-US') + ' steps' : '');
    }
    if (v == null) return 'not logged';
    const hr = isTimeUnit(h.unit) && unitMs(h.unit) === 3600000;
    return (hr ? fmtHours(v) : trimNum(v)) + ' / ' + trimNum(h.goal) + (h.unit ? ' ' + h.unit : '');
  }

  // ── nudge ──
  const dayActive = (k: string) => { const e = entries[k]; if (!e) return false; return !!((e.checks && e.checks.train) || anySets(e) || (+(e.steps ?? 0) || 0) >= WALK_MIN); };
  function missStats() {
    const upto = Math.min(TOTAL - 1, diffDays(base, d(MAXDAY)));
    let lastActive = -1;
    for (let i = upto; i >= 0; i--) if (dayActive(kAt(i))) { lastActive = i; break; }
    const since = lastActive >= 0 ? upto - lastActive : upto + 1;
    let run = 0;
    for (let i = upto - 1; i >= 0; i--) {
      const k = kAt(i), pl = plan(k);
      if (!pl.inRange) break;
      if (pl.type === 'rest') continue;
      if (dayActive(k)) break;
      run++;
    }
    return { run, since };
  }

  // ── weight ──
  const series = () => Array.from({ length: TOTAL }, (_, i) => { const k = kAt(i), e = entries[k]; return { k, i, w: e && e.w != null ? +e.w : null }; });
  function rolling(arr: { w: number | null }[], upto: number) {
    const vals: number[] = [];
    for (let i = Math.max(0, upto - 6); i <= upto; i++) if (arr[i] && arr[i].w != null) vals.push(arr[i].w!);
    if (vals.length < 2) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function projFor(idx: number) {
    const last = PROJ.length - 1;
    const t = TOTAL > 1 ? (idx / (TOTAL - 1)) * WEEKS_N : 0;
    const lo = Math.min(last, Math.floor(t)), hi = Math.min(last, lo + 1), f = t - Math.floor(t);
    return PROJ[lo] * (1 - f) + PROJ[hi] * f;
  }
  function rateOfLoss() {
    const s = series(), pts: { x: number; y: number }[] = [];
    const tIdx = Math.max(0, Math.min(TOTAL - 1, diffDays(base, d(MAXDAY))));
    for (let i = Math.max(0, tIdx - 27); i <= tIdx; i++) if (s[i] && s[i].w != null) pts.push({ x: i, y: s[i].w! });
    if (pts.length < 4 || pts[pts.length - 1].x - pts[0].x < 9) return null;
    const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach((p) => { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
    const denom = n * sxx - sx * sx; if (denom === 0) return null;
    return { perDay: (n * sxy - sx * sy) / denom, tIdx };
  }
  const waistSeries = () => {
    const out: { k: string; v: number }[] = [];
    for (let i = 0; i < TOTAL; i++) { const k = kAt(i), e = entries[k]; if (e && e.waist != null && !Number.isNaN(+e.waist)) out.push({ k, v: +e.waist }); }
    return out;
  };
  /** r19 renderStats, as values: the stat grid on Progress. TODAY is the browsed day. */
  function stats(TODAY: string) {
    const s = series(); let last: number | null = null, lastI = -1;
    s.forEach((x, i) => { if (x.w != null) { last = x.w; lastI = i; } });
    const loggedDays = Object.keys(entries).filter((k) => {
      const e = entries[k] as Record<string, unknown>;
      return k >= START && k <= MAXDAY && e && Object.keys(e).some((f) => { const v = e[f]; return v != null && v !== '' && !(typeof v === 'object' && !Object.keys(v as object).length); });
    }).length;
    const avg = lastI >= 0 ? rolling(s, lastI) : null;
    const delta = last != null ? (last as number) - START_KG : null;
    const pidx = Math.max(0, Math.min(TOTAL - 1, diffDays(base, d(TODAY))));
    const pj = projFor(pidx);
    const avAt = rolling(s, Math.min(pidx, lastI >= 0 ? lastI : pidx));
    const wAt = avAt != null ? avAt : s[pidx] && s[pidx].w != null ? s[pidx].w : last;
    const projNote = wAt == null ? 'the dashed line on the chart'
      : Math.abs(wAt - pj) < 0.15 ? 'your average is level with it'
      : 'your average is ' + trimNum(Math.abs(wAt - pj)) + ' kg ' + ((TARGET_KG >= START_KG ? wAt < pj : wAt > pj) ? 'behind it' : 'ahead of it');
    const r = rateOfLoss();
    let rate: { value: string | null; note: string };
    if (r && r.perDay < 0 && last != null) {
      const projEnd = (last as number) + r.perDay * ((TOTAL - 1) - r.tIdx), perWk = r.perDay * 7;
      let eta = '';
      if (TARGET_KG < (last as number)) {
        const dToT = (TARGET_KG - (last as number)) / r.perDay;
        if (dToT > 0 && dToT < 3650) eta = 'hits ' + trimNum(TARGET_KG) + ' kg ≈ ' + shortDate(addDays(d(MAXDAY), Math.round(dToT)));
      }
      rate = { value: projEnd.toFixed(1) + ' kg', note: 'by ' + shortDate(d(END)) + ' · ' + trimNum(perWk) + ' kg/wk' + (eta ? ' · ' + eta : '') };
    } else rate = { value: null, note: r ? 'trend is flat or up — no loss to project' : 'needs 2+ weeks of weigh-ins' };
    return {
      latest: last as number | null, latestDay: lastI >= 0 ? s[lastI].k : null, avg, delta, proj: pj, projNote, rate, loggedDays, total: TOTAL,
    };
  }

  // ── load volume per exercise ──
  function exVolume(e: DayEntry | undefined, nm: string) {
    if (!e || !e.sets) return null;
    const kind = loadKind(nm); let kg = 0, has = false;
    (e.sets[nm] || []).forEach((x) => {
      if (!x || x.r == null) return;
      const load = kind === 'weight' ? (x.w != null ? x.w : null) : kind === 'band' ? bandKg(bands, x.b) : null;
      if (load != null && load > 0) { kg += load * x.r; has = true; }
    });
    return has ? kg : null;
  }
  function progExercises() {
    const cnt: Record<string, number> = {};
    for (let i = 0; i < TOTAL; i++) { const e = entries[kAt(i)]; if (!e || !e.sets) continue; Object.keys(e.sets).forEach((nm) => { if (exVolume(e, nm) != null) cnt[nm] = (cnt[nm] || 0) + 1; }); }
    return Object.keys(cnt).map((nm) => ({ nm, n: cnt[nm] })).sort((a, b) => b.n - a.n || a.nm.localeCompare(b.nm));
  }
  const exSeries = (nm: string) => {
    const out: { k: string; vol: number }[] = [];
    for (let i = 0; i < TOTAL; i++) { const k = kAt(i), v = exVolume(entries[k], nm); if (v != null) out.push({ k, vol: v }); }
    return out;
  };

  return {
    habitVal, habitStreak, habitLongest, habitStrength, habitPct, habitsHitPct, trainedOn, dayState, streaks, itemState, calItems, dayScore, dotState,
    itemValTxt, dayActive, missStats, series, rolling, projFor, rateOfLoss, waistSeries, stats, exVolume, progExercises, exSeries, todayI,
  };
}
export type Days = ReturnType<typeof makeDays>;
