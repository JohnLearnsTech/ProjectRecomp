// Builds r19's entries map for the goal window from the database, and the Days engine on top.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { makeDays, normUnit, type DayEntry, type Entries, type HabitDef } from '../domain/days';
import { defaultBands, type Band } from '../domain/training';
import * as db from './db';
import { useRecomp } from './recomp';
import { toHistory } from './workout';

export async function loadEntries(from: string, to: string): Promise<Entries> {
  const [logs, food, sets, habitLogs, ticks] = await Promise.all([
    db.listDayLogs(from, to), db.listFoodDates(from, to), db.listSetsRange(from, to), db.listHabitLogsRange(from, to), db.listTicks(from, to),
  ]);
  const E: Entries = {};
  const at = (k: string): DayEntry => (E[k] ||= {});
  logs.forEach((l) => {
    const e = at(l.date);
    if (l.weight_kg != null) e.w = +l.weight_kg;
    if (l.steps != null) e.steps = l.steps;
    if (l.sleep_h != null) e.sleep = +l.sleep_h;
    if (l.waist_cm != null) e.waist = +l.waist_cm;
    if (l.note) e.note = l.note;
    if (l.kcal_total != null) e.kcal = l.kcal_total;
    if (l.protein_total_g != null) e.protein = l.protein_total_g;
  });
  food.forEach((f) => { (at(f.date).food ||= []).push(f.id); });
  const hist = toHistory(sets);
  Object.keys(hist).forEach((k) => { at(k).sets = hist[k]; });
  habitLogs.forEach((h) => { (at(h.date).habits ||= {})[h.habit_id] = +h.value; });
  ticks.forEach((t) => { (at(t.date).checks ||= {})[t.check_id] = t.done; });
  return E;
}

export const toHabitDef = (h: db.Habit): HabitDef => ({ id: h.id, name: h.name, type: h.type, unit: normUnit(h.unit), goal: +h.goal, step: +h.step > 0 ? +h.step : 1 });

/** Goal-window history plus the r19 habit, consistency and progress functions over it. */
function useDaysState() {
  const { engine, maxDay, rev, profileRow } = useRecomp();
  const { START, END } = engine.T;
  const [entries, setEntries] = useState<Entries>({});
  const [habitRows, setHabitRows] = useState<db.Habit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const [E, hs] = await Promise.all([loadEntries(START, END), db.listHabits()]);
    setEntries(E); setHabitRows(hs); setLoaded(true);
  }, [START, END]);
  useEffect(() => { load().catch(() => setLoaded(true)); }, [load, rev]);
  const bands: Band[] = profileRow?.bands?.length === 5 ? profileRow.bands : defaultBands();
  const habits = useMemo(() => habitRows.map(toHabitDef), [habitRows]);
  const D = useMemo(() => makeDays({ entries, engine, MAXDAY: maxDay, habits, bands }), [entries, engine, maxDay, habits, bands]);
  // r19 getKeystone(): the chosen habit, else the first build habit, else the first habit.
  const keystone = habits.find((h) => h.id === profileRow?.keystone_habit_id) ?? habits.find((h) => h.type === 'build') ?? habits[0] ?? null;
  return { D, entries, habits, habitRows, keystone, loaded, reload: load };
}

type DaysValue = ReturnType<typeof useDaysState>;
const DaysContext = createContext<DaysValue | null>(null);
/** One shared load per change, for every screen that needs the history. */
export function DaysProvider({ children }: { children: ReactNode }) {
  const v = useDaysState();
  return createElement(DaysContext.Provider, { value: v }, children);
}
export function useDays() {
  const v = useContext(DaysContext);
  if (!v) throw new Error('useDays outside DaysProvider');
  return v;
}
