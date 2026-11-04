// Habit actions on top of db.ts, following r19's setHabitVal, stopTimer, logFocus and friends.
import { localKey } from '../domain/dates';
import { isTimeUnit, unitMs, type HabitDef } from '../domain/days';
import * as db from './db';
import { stopTimer, type Seg } from './habitTimers';

const round = (x: number, dec: number) => +x.toFixed(dec);

export const setValue = (h: HabitDef, day: string, v: number | null) => db.setHabitValue(h.id, day, v == null ? null : Math.max(0, v));

const sessionsRows = (h: HabitDef, day: string, segs: Seg[], source: 'timer' | 'pomodoro') =>
  segs.filter((g) => g.e > g.s).map((g) => ({ habit_id: h.id, date: day, started_at: new Date(g.s).toISOString(), ended_at: new Date(g.e).toISOString(), source }));

/** Stop & log: the elapsed time goes to the timer's own day, with its segments as sessions. */
export async function stopAndLog(h: HabitDef, current: (day: string) => number | null) {
  const r = stopTimer(h.id); if (!r) return null;
  const dec = unitMs(h.unit) === 3600000 ? 2 : 0;
  const nv = round((current(r.day) ?? 0) + r.ms / unitMs(h.unit), dec);
  await db.addHabitSessions(sessionsRows(h, r.day, r.segs, 'timer'));
  await setValue(h, r.day, nv);
  return { day: r.day, ms: r.ms };
}

/** Pomodoro minutes to the focus habit, on today's date. */
export async function logFocus(h: HabitDef, min: number, current: (day: string) => number | null) {
  if (!(min > 0)) return;
  const day = localKey(), now = Date.now();
  const hr = unitMs(h.unit) === 3600000;
  await db.addHabitSessions(sessionsRows(h, day, [{ s: now - min * 60000, e: now }], 'pomodoro'));
  await setValue(h, day, round((current(day) ?? 0) + (hr ? min / 60 : min), hr ? 2 : 0));
}

/** Deleting a session subtracts its time from the day's value. */
export async function deleteSession(h: HabitDef, s: db.HabitSession, current: number | null) {
  const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
  const dec = unitMs(h.unit) === 3600000 ? 2 : 0;
  await db.deleteHabitSession(s.id);
  await setValue(h, s.date, Math.max(0, round((current ?? 0) - ms / unitMs(h.unit), dec)));
}

/** Reset the day: clear its value and its sessions (r19 resetHabitToday). */
export async function resetDay(h: HabitDef, day: string) {
  if (isTimeUnit(h.unit)) await db.deleteHabitSessionsFor(h.id, day);
  await setValue(h, day, null);
}

/** Pomodoro's habit: the chosen one, else the first timed build habit about focus. */
export const pomoTarget = (habits: HabitDef[], targetId: string | null) =>
  (targetId && habits.find((h) => h.id === targetId)) ||
  habits.find((h) => h.type === 'build' && isTimeUnit(h.unit) && /focus|work|study|read|deep|learn|write|code/i.test(h.name)) || null;
