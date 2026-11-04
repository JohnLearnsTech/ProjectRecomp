// Training rules, ported from recomp.html r19 (05-business-logic §3.6-3.8, §8).
// r19 reads globals (entries, swaps, bands, PL, P); here they are arguments.
import altpoolJson from './data/altpool.json';
import exgroupJson from './data/exgroup.json';
import { addDays, d, key, trimNum } from './dates';
import type { Plan } from './types';

const EXGROUP = exgroupJson as Record<string, string>;
const ALTPOOL = altpoolJson as Record<string, { home?: string[]; gym?: string[] }>;

/** One set: w kg, r reps (or seconds), b band slot 1..5. Empty {} marks a gap. */
export type Set_ = { w?: number | null; r?: number | null; b?: number | null };
/** entries[date][exercise name] = sets, r19's day.sets map. */
export type SetHistory = Record<string, Record<string, Set_[]>>;
export type Band = { n: string; kg: number | null };
export type Kind = 'weight' | 'band' | 'body';
export const BAND_N = 5;

export const defaultBands = (): Band[] => Array.from({ length: BAND_N }, (_, i) => ({ n: 'Band ' + (i + 1), kg: null }));
export const bandAt = (bands: Band[] | null | undefined, i: number): Band => {
  const b = bands && bands.length === BAND_N ? bands : defaultBands();
  return i >= 1 && i <= BAND_N && b[i - 1] ? b[i - 1] : { n: 'Band ' + i, kg: null };
};
export const bandName = (bands: Band[] | null | undefined, i: number) => bandAt(bands, i).n;
export const bandKg = (bands: Band[] | null | undefined, i: number | null | undefined) => {
  if (i == null) return null; const k = bandAt(bands, i).kg; return k != null && k > 0 ? k : null;
};
export const bandLabel = (bands: Band[] | null | undefined, i: number) => {
  const b = bandAt(bands, i); return b.n + (b.kg != null && b.kg > 0 ? ' · ' + trimNum(b.kg) + ' kg' : '');
};

export const setCount = (scheme: string) => { const m = scheme.match(/(\d+)\s*×/); return m ? +m[1] : 3; };
export const isTimed = (sch: string) => /\bs\b|sec/.test(String(sch).split('×')[1] || '');
export function topReps(scheme: string) {
  const m = scheme.split('×')[1] || '';
  const nums = m.match(/\d+/g);
  if (!nums || /\bs\b|sec/.test(m)) return null;
  return +nums[nums.length - 1];
}
export function repRange(sch: string) {
  const m = (String(sch).split('×')[1] || '').match(/(\d+)(?:\s*-\s*(\d+))?/);
  return m ? { lo: +m[1], hi: +(m[2] || m[1]) } : { lo: 10, hi: 10 };
}
const BAND_RX = /\bband\b/i;
const BODY_RX = [
  /incline push-up/i, /wall push-up/i, /knee push-up/i, /close-grip push-up/i,
  /incline plank/i, /side plank/i, /reverse plank/i, /plank on the wall/i,
  /^split squat, hand on chair/i, /^low-step step-up/i, /^reverse lunge to a chair/i,
  /back extension/i, /^chair squat/i, /^reverse lunge, hand on a chair/i, /towel row/i, /^wall sit/i,
  /standing march/i, /isometric row/i, /calf raise on a step/i, /knee-to-elbow/i, /^single-leg rdl, hand on chair/i,
];
export function loadKind(nm: string): Kind {
  if (BAND_RX.test(nm)) return 'band';
  for (const rx of BODY_RX) if (rx.test(nm)) return 'body';
  return 'weight';
}
export const stepFor = (name: string) => (/leg press|squat|hip thrust|leg curl|leg extension|calf|romanian|deadlift|step-up|glute/i.test(name) ? 5 : 2.5);
export const filled = (arr: Set_[]) => arr.filter((x) => x && (x.w != null || x.r != null || x.b != null));
export function setTxt(x: Set_, timed: boolean, bands?: Band[] | null) {
  const rp = x.r != null ? trimNum(x.r) + (timed ? 's' : '') : '–';
  const ld = x.w != null ? trimNum(x.w) + '×' : x.b != null ? bandName(bands, x.b) + '×' : '';
  return ld + rp;
}
export const exDone = (arr: Set_[], sch: string) => arr.filter((x) => x && x.r != null).length >= setCount(sch);

// ── swaps ──
const ctxOf = (PL: Plan, session: string) => { const pg = PL.programs[session]; return pg && (pg.kit === 'home' || pg.kit === 'body') ? 'home' : 'gym'; };
export function poolFor(PL: Plan, session: string, defName: string) {
  const g = EXGROUP[defName]; if (!g) return [] as string[];
  const c = ALTPOOL[g]; return c && c[ctxOf(PL, session)] ? c[ctxOf(PL, session)]! : [];
}
export type Resolved = { def: string; sch: string; pool: string[]; name: string; cue: string; swapped: boolean };
/** The session line owns the scheme; a swap changes only the name and the cue. */
export function resolveLine(PL: Plan, swaps: Record<string, string>, session: string, defLine: string): Resolved {
  const q = defLine.split('|'), defName = q[0], sch = q[1], defCue = q[2] || '';
  const pool = poolFor(PL, session, defName);
  const sw = swaps[session + '|' + defName];
  let opt: string[] | null = null;
  if (sw) for (const p of pool) if (p.split('|')[0] === sw) { opt = p.split('|'); break; }
  return { def: defName, sch, pool, name: opt ? opt[0] : defName, cue: opt ? opt[1] : defCue, swapped: !!opt };
}
export const sessionList = (PL: Plan, swaps: Record<string, string>, session: string | null) =>
  (session && PL.programs[session] ? PL.programs[session].ex : []).map((r) => resolveLine(PL, swaps, session!, r));

// ── history ──
export type Last = { k: string; sets: Set_[] };
/** Latest day strictly before today, on the goal timeline, with any filled set for this name. */
export function lastFor(name: string, entries: SetHistory, START: string, TOTAL: number, TODAY: string): Last | null {
  const base = d(START); let best: Last | null = null;
  for (let i = 0; i < TOTAL; i++) {
    const k = key(addDays(base, i));
    if (k >= TODAY) break;
    const arr = filled(entries[k]?.[name] ?? []);
    if (arr.length) best = { k, sets: arr };
  }
  return best;
}
const bestVal = (x: Set_, kind: Kind) => (kind === 'weight' ? x.w : kind === 'band' ? x.b : x.r);
/** Best load (kg, band slot, or reps for bodyweight) on any day before today. */
export function bestBefore(nm: string, kind: Kind, entries: SetHistory, TODAY: string) {
  let best: number | null = null;
  Object.keys(entries).forEach((k) => {
    if (k >= TODAY || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    filled(entries[k]?.[nm] ?? []).forEach((x) => { if (x.r == null) return; const v = bestVal(x, kind); if (v != null && (best == null || v > best)) best = v; });
  });
  return best;
}
export function bestToday(nm: string, kind: Kind, today: Set_[]) {
  let best: number | null = null;
  filled(today).forEach((x) => { if (x.r == null) return; const v = bestVal(x, kind); if (v != null && (best == null || v > best)) best = v; });
  return best;
}
export const prText = (nm: string, kind: Kind, v: number, bands?: Band[] | null) =>
  kind === 'weight' ? trimNum(v) + ' kg on ' + nm : kind === 'band' ? bandName(bands, v) + ' on ' + nm : v + ' reps on ' + nm;

/** The inline progression nudge on the Train list ("add 2.5 kg", "move up to Red"). */
export function progressHint(nm: string, sch: string, kind: Kind, lp: Last | null, phase: number, bands?: Band[] | null) {
  if (!lp) return null;
  const top = topReps(sch);
  const allTop = top && lp.sets.length >= setCount(sch) && lp.sets.every((x) => x.r != null && x.r >= top);
  if (!allTop) return null;
  if (kind === 'band') {
    let hb = 0; lp.sets.forEach((x) => { if ((x.b ?? 0) > hb) hb = x.b!; });
    return hb > 0 && hb < BAND_N ? 'move up to ' + bandName(bands, hb + 1) : 'slow the lowering, or shorten the band';
  }
  if (kind === 'body' || phase === 1) return 'add a rep or slow the lowering';
  return 'add ' + stepFor(nm) + ' kg';
}

export type Suggestion = { w?: number | null; b?: number | null; r: number; msg: string };
/** Session-mode double progression: what to aim for today, from last time. */
export function woSuggest(nm: string, sch: string, kind: Kind, lp: Last | null, phase: number, bands?: Band[] | null): Suggestion {
  const rr = repRange(sch), top = topReps(sch), timed = isTimed(sch);
  const u = timed ? ' s' : ' reps';
  if (!lp) return { w: null, b: null, r: rr.lo, msg: kind === 'weight'
    ? 'First time: pick a load you could do ' + (rr.hi + 2) + ' times, and stop at ' + rr.lo + '.'
    : kind === 'band' ? 'First time: start on a band you could do ' + (rr.hi + 2) + ' times with.' : 'First time: aim for ' + rr.lo + u + ' a set.' };
  const allTop = top && lp.sets.length >= setCount(sch) && lp.sets.every((x) => x.r != null && x.r >= top);
  let lastW: number | null = null, lastB: number | null = null, lastR: number | null = null;
  lp.sets.forEach((x) => {
    if (x.w != null && (lastW == null || x.w > lastW)) lastW = x.w;
    if (x.b != null && (lastB == null || x.b > lastB)) lastB = x.b;
    if (lastR == null && x.r != null) lastR = x.r;
  });
  const more = Math.min(rr.hi, (lastR || rr.lo) + 1);
  if (kind === 'weight') {
    if (allTop && lastW != null && phase !== 1) return { w: lastW + stepFor(nm), r: rr.lo, msg: 'You hit ' + top + ' on every set last time. Add ' + stepFor(nm) + ' kg and start again at ' + rr.lo + '.' };
    if (allTop) return { w: lastW, r: rr.hi, msg: 'Top of the range last time. Keep the load and slow the lowering to 3 seconds.' };
    return { w: lastW, r: more, msg: 'Same load as last time. Beat it by one rep on at least one set.' };
  }
  if (kind === 'band') {
    if (allTop && lastB != null && lastB < BAND_N) return { b: lastB + 1, r: rr.lo, msg: 'Top of the range last time. Move up to ' + bandName(bands, lastB + 1) + ' and start at ' + rr.lo + '.' };
    return { b: lastB, r: allTop ? rr.hi : more, msg: allTop ? 'Heaviest band already. Slow the lowering, or shorten the band.' : 'Same band. Aim for one more rep than last time.' };
  }
  return { r: allTop ? rr.hi : more, msg: allTop ? 'Top of the range. Slow the lowering to 3 seconds to make it harder.' : 'Aim for one more' + (timed ? ' second block' : ' rep') + ' than last time.' };
}

// ── volume ──
export type Volume = { kg: number; sets: number; out: number };
/** Load volume of the day's planned session: kg x reps; bands use band kg; timed and bodyweight sets are "out". */
export function volumeOf(dayPlan: { inRange: boolean; type: string; session: string | null }, PL: Plan, swaps: Record<string, string>, day: Record<string, Set_[]> | undefined, bands?: Band[] | null): Volume | null {
  if (!dayPlan.inRange || dayPlan.type !== 'lift' || !dayPlan.session || !day) return null;
  let kg = 0, sets = 0, out = 0;
  sessionList(PL, swaps, dayPlan.session).forEach((R) => {
    const timed = isTimed(R.sch), kind = loadKind(R.name);
    (day[R.name] ?? []).forEach((x) => {
      if (!x || x.r == null) return;
      const load = kind === 'weight' ? (x.w != null ? x.w : null) : kind === 'band' ? bandKg(bands, x.b) : null;
      if (timed || load == null || !(load > 0)) { out++; return; }
      kg += load * x.r; sets++;
    });
  });
  return { kg, sets, out };
}
/** Latest earlier day with the same planned session and some load: the fair comparison. */
export function lastSameSession(plan: (k: string) => { inRange: boolean; type: string; session: string | null }, session: string, PL: Plan, swaps: Record<string, string>,
  entries: SetHistory, START: string, TOTAL: number, TODAY: string, bands?: Band[] | null) {
  const base = d(START); let best: { k: string; v: Volume } | null = null;
  for (let i = 0; i < TOTAL; i++) {
    const k = key(addDays(base, i));
    if (k >= TODAY) break;
    const p = plan(k); if (p.session !== session) continue;
    const v = volumeOf(p, PL, swaps, entries[k], bands);
    if (v && v.kg > 0) best = { k, v };
  }
  return best;
}

export function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return hh > 0 ? hh + ':' + p(mm) + ':' + p(ss) : mm + ':' + p(ss);
}

/** YouTube search for the exercise's form, as r19 links it. */
export const ytHref = (name: string) =>
  'https://www.youtube.com/results?search_query=' + encodeURIComponent(String(name).split(',')[0].replace(/\(.*\)/, '').trim() + ' exercise form');
