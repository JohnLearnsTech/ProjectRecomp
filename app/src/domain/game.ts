// Gamification: reward showing up, never punish a miss. Everything is derived from the log, so
// it works on history and can't drift from it. Pure: no I/O.
//
// - A day is WON when its floor is met (r19 FLOORS: the minimum that still counts).
// - Points reward real effort, capped per day; the first day back after a miss counts double.
// - Levels grow with days won and never go down.
// - Streaks forgive one missed day per Monday-to-Sunday week.
import { addDays, d, diffDays, key, mondayOf } from './dates';
import { habitMet, isTimeUnit, tracksSteps, unitMs, type DayEntry, type Entries, type HabitDef } from './days';
import type { Engine } from './plan';

export const LEVELS: [number, string][] = [[0, 'Day One'], [3, 'Showing Up'], [10, 'Building'], [25, 'Consistent'], [50, 'Hardworking'], [100, 'Unstoppable']];
export const DAY_CAP = 100;

export type DayResult = { k: string; won: boolean; pending: boolean; pts: number; comeback: boolean; type: string };
export type Badge = { id: string; name: string; why: string; at: string | null };

const filledSets = (a: unknown) => (Array.isArray(a) ? a.filter((x) => x && (x.w != null || x.r != null || x.b != null)).length : 0);

/** Minutes walked that day, from the walk habit (minutes or hours). */
function walkMin(e: DayEntry | undefined, habits: HabitDef[]) {
  const w = habits.find((h) => tracksSteps(h));
  if (!w || !e?.habits || e.habits[w.id] == null) return 0;
  const v = +e.habits[w.id];
  return isTimeUnit(w.unit) && unitMs(w.unit) === 3600000 ? v * 60 : v;
}

/** The floor for a day, in plain words, and whether it is met. */
export function floorFor(engine: Engine, k: string, e: DayEntry | undefined, habits: HabitDef[], pFloor: number, trained: boolean) {
  const p = engine.plan(k), steps = +(e?.steps ?? 0), walk = walkMin(e, habits);
  const exercises = e?.sets ? Object.values(e.sets).filter((a) => filledSets(a) > 0).length : 0;
  if (!p.inRange) return { met: false, text: '', type: 'off' };
  if (p.type === 'lift') return { met: trained || exercises >= 2, text: 'The warm-up plus the first two exercises.', type: 'lift' };
  if (p.type === 'cardio') return { met: walk >= 10 || steps >= 2000 || !!e?.checks?.train, text: 'Ten minutes of walking.', type: 'cardio' };
  const water = !!e?.checks?.water, protein = !!e?.checks?.protein || (e?.protein != null && +e.protein >= pFloor), moved = walk >= 10 || steps >= 3000;
  return { met: [water, protein, moved].filter(Boolean).length >= 2, text: 'Water, protein, a short walk. Two of the three.', type: 'rest' };
}

export type GameInput = { engine: Engine; entries: Entries; habits: HabitDef[]; maxDay: string; pFloor: number; trainedOn: (k: string) => boolean;
  prDays?: string[]; questWeeks?: { end: string; done: number; of: number }[] };

export function gameState(g: GameInput) {
  const { engine, entries, habits, maxDay, pFloor } = g;
  const { START } = engine.T;
  const days: DayResult[] = [];
  let prevWon: boolean | null = null;
  for (let k = START; k <= maxDay; k = key(addDays(d(k), 1))) {
    const e = entries[k], trained = g.trainedOn(k);
    const f = floorFor(engine, k, e, habits, pFloor, trained);
    if (f.type === 'off') continue;
    const pending = k === maxDay && !f.met;
    let pts = 0;
    if (f.met) pts += 30;
    if ((f.type === 'lift' && trained) || (f.type === 'cardio' && (+(e?.steps ?? 0) >= engine.plan(k).steps || !!e?.checks?.train))) pts += 25;
    pts += Math.min(20, Math.floor(walkMin(e, habits)));
    pts += Math.min(15, 5 * habits.filter((h) => h.type === 'build' && e?.habits?.[h.id] != null && habitMet(h, +e.habits[h.id])).length);
    if (e?.protein != null && +e.protein >= pFloor) pts += 10;
    if (e?.kcal && +e.kcal > 0) pts += 5;
    if (e?.w != null) pts += 5;
    pts = Math.min(DAY_CAP, pts);
    const comeback = f.met && prevWon === false;
    if (comeback) pts *= 2;
    days.push({ k, won: f.met, pending, pts, comeback, type: f.type });
    if (!pending) prevWon = f.met;
  }
  const won = days.filter((x) => x.won);
  const totalWon = won.length, points = days.reduce((a, x) => a + x.pts, 0);
  // Level by days won.
  let li = 0; LEVELS.forEach(([n], i) => { if (totalWon >= n) li = i; });
  const next = LEVELS[li + 1] ?? null;
  // Streak back from today: today counts only once won; one miss a week is forgiven.
  const streakAt = (end: number) => {
    let n = 0; const used = new Set<string>();
    for (let i = end; i >= 0; i--) {
      const x = days[i];
      if (x.pending) continue;
      if (x.won) { n++; continue; }
      const wk = mondayOf(x.k);
      if (used.has(wk)) break;
      used.add(wk);
    }
    return n;
  };
  const streak = days.length ? streakAt(days.length - 1) : 0;
  let best = 0; days.forEach((_, i) => { if (days[i].won) best = Math.max(best, streakAt(i)); });
  const today = days.find((x) => x.k === maxDay) ?? null;

  // Badges, each with the day it was earned.
  const nth = (arr: DayResult[], n: number) => (arr.length >= n ? arr[n - 1].k : null);
  const sessions = days.filter((x) => x.type === 'lift' && g.trainedOn(x.k));
  let streak7: string | null = null, streak30: string | null = null;
  days.forEach((x, i) => { if (!x.won) return; const s = streakAt(i); if (s >= 7 && !streak7) streak7 = x.k; if (s >= 30 && !streak30) streak30 = x.k; });
  const longWalk = days.find((x) => walkMin(entries[x.k], habits) >= 60)?.k ?? null;
  const quests = (g.questWeeks ?? []).find((q) => q.of > 0 && q.done >= q.of);
  const badges: Badge[] = [
    { id: 'first', name: 'Day one, won', why: 'Your first day won.', at: nth(won, 1) },
    { id: 'won10', name: 'Ten days won', why: 'Ten days where the floor was met.', at: nth(won, 10) },
    { id: 'week', name: 'A week strong', why: 'A seven-day streak.', at: streak7 },
    { id: 'back', name: 'Came back', why: 'Won a day right after missing one.', at: won.find((x) => x.comeback)?.k ?? null },
    { id: 's10', name: 'Ten sessions', why: 'Ten lifting sessions done.', at: nth(sessions, 10) },
    { id: 'pr', name: 'Stronger', why: 'A new best on a lift.', at: g.prDays?.[0] ?? null },
    { id: 'walk60', name: 'The long walk', why: 'An hour of walking in a day.', at: longWalk },
    { id: 'quests', name: 'Promises kept', why: 'Every non-negotiable done in one week.', at: quests ? quests.end : null },
    { id: 'won50', name: 'Fifty days won', why: 'Fifty days where the floor was met.', at: nth(won, 50) },
    { id: 'month', name: 'A month strong', why: 'A thirty-day streak.', at: streak30 },
  ];
  return {
    days, today, totalWon, points, streak, best, badges,
    level: { i: li, name: LEVELS[li][1], next: next ? { name: next[1], need: next[0] - totalWon, at: next[0] } : null, from: LEVELS[li][0] },
    daysIn: diffDays(d(START), d(maxDay)) + 1,
  };
}
export type Game = ReturnType<typeof gameState>;

/** Days where an exercise's load volume beat every earlier session. */
export function prDays(series: { k: string; vol: number }[][]) {
  const out: string[] = [];
  series.forEach((ser) => { let best = -1; ser.forEach((p, i) => { if (i > 0 && p.vol > best) out.push(p.k); best = Math.max(best, p.vol); }); });
  return out.sort();
}
