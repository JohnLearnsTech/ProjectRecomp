// Goal-window history for Today: weights, days logged, sessions and load changes.
import { useEffect, useState } from 'react';
import { addKey } from '../domain/dates';
import * as db from './db';
import { useRecomp } from './recomp';

export type History = {
  logs: db.DayLog[];
  sets: Awaited<ReturnType<typeof db.listSetSummary>>;
  trainTicks: Set<string>;
  entryDays: Set<string>;
};

export function useHistory() {
  const { engine, maxDay, rev } = useRecomp();
  const { START } = engine.T;
  const [h, setH] = useState<History | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([db.listDayLogs(START, maxDay), db.listSetSummary(START, maxDay), db.listTicks(START, maxDay)]).then(([logs, sets, ticks]) => {
      if (!live) return;
      const entryDays = new Set<string>([...logs.map((l) => l.date), ...sets.map((s) => s.date), ...ticks.map((t) => t.date)]);
      setH({ logs, sets, trainTicks: new Set(ticks.filter((t) => t.check_id === 'train' && t.done).map((t) => t.date)), entryDays });
    }).catch(() => {});
    return () => { live = false; };
  }, [START, maxDay, rev]);
  return h;
}

export const trainedOn = (h: History | null, k: string) => !!h && (h.trainTicks.has(k) || h.sets.some((s) => s.date === k));

/** r19 latestWeight(): the last weigh-in on the goal timeline. */
export const latestWeight = (h: History | null) => {
  if (!h) return null;
  for (let i = h.logs.length - 1; i >= 0; i--) if (h.logs[i].weight_kg != null) return +h.logs[i].weight_kg!;
  return null;
};

/** r19 renderFuel(): evidence chips pulled from your own log. */
export function evidence(h: History | null, startKg: number, START: string, maxDay: string) {
  const chips: { b: string; t: string; before?: boolean }[] = [];
  if (!h) return chips;
  const last = latestWeight(h);
  if (last != null && startKg && last < startKg) chips.push({ b: `${(startKg - last).toFixed(1)} kg`, t: ` down from ${Math.round(startKg * 10) / 10}`, before: true });
  const sessionDays = new Set(h.sets.map((s) => s.date));
  if (sessionDays.size) chips.push({ b: String(sessionDays.size), t: ` session${sessionDays.size > 1 ? 's' : ''} logged`, before: true });
  // Biggest increase in the heaviest set of a day, per exercise.
  const first: Record<string, number> = {}, lastW: Record<string, number> = {}, byDay: Record<string, Record<string, number>> = {};
  h.sets.forEach((s) => {
    if (s.weight_kg == null) return;
    const m = (byDay[s.date] ||= {});
    m[s.exercise_name] = Math.max(m[s.exercise_name] ?? -Infinity, +s.weight_kg);
  });
  Object.keys(byDay).sort().forEach((k) => Object.entries(byDay[k]).forEach(([nm, w]) => { if (first[nm] === undefined) first[nm] = w; lastW[nm] = w; }));
  let best: { nm: string; g: number } | null = null;
  Object.keys(lastW).forEach((nm) => { const g = lastW[nm] - first[nm]; if (g > 0 && (!best || g > best.g)) best = { nm, g }; });
  if (best) { const b = best as { nm: string; g: number }; chips.push({ b: `+${Math.round(b.g * 10) / 10} kg`, t: `${b.nm.split(',')[0].replace(/\(.*\)/, '').trim()} up ` }); }
  let streak = 0;
  for (let k = maxDay; k >= START; k = addKey(k, -1)) { if (h.entryDays.has(k)) streak++; else break; }
  if (streak > 1) chips.push({ b: String(streak), t: '-day logging streak', before: true });
  return chips;
}
