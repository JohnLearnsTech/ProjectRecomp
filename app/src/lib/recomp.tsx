// Loads the active goal, profile, personal foods and saved plan, builds the r19 plan engine,
// and tracks the browsed day (r19 TODAY) and the latest loggable day (MAXDAY).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { d, diffDays, todayKey } from '../domain/dates';
import { buildFoodIndex } from '../domain/food';
import { makeEngine, normPlan, provisionalGoal, type Engine } from '../domain/plan';
import type { FoodDef, Goal, Profile } from '../domain/types';
import * as db from './db';

type Ctx = {
  ready: boolean;
  error: string | null;
  engine: Engine;
  profileRow: db.Profile | null;
  foodIndex: ReturnType<typeof buildFoodIndex>;
  real: string;      // the real calendar date
  maxDay: string;    // latest loggable day: never the future, never past the goal end
  day: string;       // browsed day
  setDay: (k: string) => void;
  /** Bumped after any write so screens reload. */
  rev: number;
  touch: () => void;
  reload: () => Promise<void>;
};

const RecompContext = createContext<Ctx | null>(null);

export function toDomainGoal(g: db.Goal, ms: db.MilestoneRow[]): Goal {
  return {
    id: g.id, name: g.name, why: g.why, type: g.type, start: g.start_date, due: g.due_date, event: g.event_date,
    trainStart: g.train_start_date, startKg: g.start_kg, targetKg: g.target_kg, kcal: g.kcal, protein: g.protein_g,
    steps: g.steps, homeFirst: g.home_first, done: g.status === 'done',
    milestones: ms.map((m) => ({ d: m.date, k: m.kind, t: m.text })),
  };
}
export function toDomainProfile(p: db.Profile | null, foods: db.PersonalFood[]): Profile {
  return {
    name: p?.name, sex: p?.sex === 'unspecified' || !p ? '' : p.sex, equip: p?.equipment, days: p?.training_days,
    waistDay: p?.waist_weekday, waterL: p?.water_l, kcalFloor: p?.kcal_floor, proteinFloor: p?.protein_floor,
    myFoods: foods.map((f): FoodDef => ({ n: f.name, k: f.keywords, per: f.per, g: +f.grams, v: [+f.kcal, +f.protein_g, +f.carbs_g, +f.fat_g, +f.fiber_g] })),
  };
}

const maxDayFor = (real: string, g: Goal) => (diffDays(d(g.start), d(real)) < 0 ? g.start : real > g.due ? g.due : real);

export function RecompProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ engine: Engine; profileRow: db.Profile | null; foodIndex: Ctx['foodIndex'] }>(() => ({
    engine: makeEngine(provisionalGoal(), {}, null, null), profileRow: null, foodIndex: buildFoodIndex(),
  }));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [real, setReal] = useState(todayKey());
  const [day, setDayRaw] = useState(todayKey());
  const [rev, setRev] = useState(0);
  const onMax = useRef(true);

  const reload = useCallback(async () => {
    try {
      const [p, active, foods, planRow] = await Promise.all([db.getProfile(), db.getActiveGoal(), db.listPersonalFoods(), db.getCurrentPlan()]);
      // r19 activeGoal(): the live goal, else the last goal, else a provisional one (which opens setup).
      const g = active ?? (await db.getLatestGoal());
      const goal = g ? toDomainGoal(g, await db.listMilestones(g.id)) : provisionalGoal();
      const profile = toDomainProfile(p, foods);
      const firstW = goal.startKg ? null : await db.firstWeightFrom(goal.start);
      const engine = makeEngine(goal, profile, planRow ? normPlan(planRow.body) : null, firstW);
      setState({ engine, profileRow: p, foodIndex: buildFoodIndex(profile.myFoods) });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const G = state.engine.G;
  const maxDay = maxDayFor(real, G);

  // r19 rollDay(): a phone left open overnight must move to the new day.
  useEffect(() => {
    const roll = () => { const now = todayKey(); setReal((r) => (r === now ? r : now)); };
    const t = setInterval(roll, 60000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') roll(); });
    return () => { clearInterval(t); sub.remove(); };
  }, []);
  useEffect(() => {
    setDayRaw((cur) => (onMax.current || cur > maxDay ? maxDay : cur < G.start ? G.start : cur));
  }, [maxDay, G.start]);

  const setDay = useCallback((k: string) => {
    const clamped = k < G.start ? G.start : k > G.due ? G.due : k;
    onMax.current = clamped === maxDay;
    setDayRaw(clamped);
  }, [G.start, G.due, maxDay]);

  const value = useMemo<Ctx>(() => ({
    ready, error, ...state, real, maxDay, day, setDay, rev, touch: () => setRev((r) => r + 1), reload,
  }), [ready, error, state, real, maxDay, day, setDay, rev, reload]);

  return <RecompContext.Provider value={value}>{children}</RecompContext.Provider>;
}

export function useRecomp() {
  const v = useContext(RecompContext);
  if (!v) throw new Error('useRecomp outside RecompProvider');
  return v;
}
