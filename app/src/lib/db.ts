// Typed access to the Recomp schema (supabase/migrations/0001_init.sql).
// RLS scopes every query to the signed-in user, so no user_id filters are needed;
// user_id is filled by the column default auth.uid() on insert.
import { supabase } from './supabase';

/** r19 day key: the device's local calendar date, YYYY-MM-DD. */
export const localDayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const must = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

// ── Profile ──
export type Sex = 'female' | 'male' | 'unspecified';
export type Profile = {
  user_id: string;
  name: string | null;
  sex: Sex;
  age: number | null;
  height_cm: number | null;
  cuisine: string | null;
  water_l: number | null;
  kcal_floor: number | null;
  protein_floor: number | null;
  joint_friendly: boolean;
  rules: string | null;
  equipment: 'gym' | 'home' | 'body';
  training_days: number;
  waist_weekday: number;
  setup_at: string | null;
  keystone_habit_id: string | null;
  bands: { n: string; kg: number | null }[];
};
export type ProfilePatch = Partial<Omit<Profile, 'user_id'>>;

export const getProfile = async () =>
  must(await supabase.from('profiles').select('*').maybeSingle()) as Profile | null;

export const updateProfile = async (patch: ProfilePatch) => {
  // One row per user; RLS limits the update to it.
  must(await supabase.from('profiles').update(patch).not('user_id', 'is', null));
};

// ── Goal and plan ──
export type GoalType = 'lose' | 'recomp' | 'muscle' | 'health' | 'gain' | 'maintain';
export type Goal = {
  id: string; name: string; why: string; type: GoalType;
  start_date: string; due_date: string; event_date: string | null; train_start_date: string | null;
  start_kg: number | null; target_kg: number | null; end_kg: number | null;
  kcal: number; protein_g: number; steps: number; home_first: boolean; status: 'active' | 'done'; sort: number;
};
export const getActiveGoal = async () =>
  must(await supabase.from('goals').select('*').eq('status', 'active').maybeSingle()) as Goal | null;

export type PlanRow = { id: string; version: number; source: 'default' | 'claude' | 'you'; note: string | null; body: unknown; created_at: string };
/** null = no saved plan, so the default protocol applies (rebuilt from goal + profile). */
export const getCurrentPlan = async () =>
  must(await supabase.from('plans').select('id, version, source, note, body, created_at').eq('is_current', true).maybeSingle()) as PlanRow | null;

// ── Day log ──
export type DayLog = {
  date: string;
  weight_kg: number | null; steps: number | null; sleep_h: number | null; waist_cm: number | null;
  note: string | null; kcal_total: number | null; protein_total_g: number | null;
};
export type DayFields = Partial<Pick<DayLog, 'weight_kg' | 'steps' | 'sleep_h' | 'waist_cm' | 'note'>>;

export const getDayLog = async (date: string) =>
  must(await supabase.from('day_logs').select('*').eq('date', date).maybeSingle()) as DayLog | null;

export const listDayLogs = (from: string, to: string) =>
  pageAll<DayLog>((a, b) => supabase.from('day_logs').select('*').gte('date', from).lte('date', to).order('date').range(a, b));

/** Upserts only the given fields; null clears a field ("not logged"). */
export const saveDayFields = async (date: string, fields: DayFields) => {
  must(await supabase.from('day_logs').upsert({ date, ...fields }, { onConflict: 'user_id,date' }));
};

// ── Food ──
export type FoodSource = 'table' | 'claude' | 'you' | 'label' | 'none';
export type FoodEntry = {
  id: string; date: string; position: number; meal_no: number | null;
  label: string; raw_text: string | null; grams: number | null;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
  source: FoodSource; cache_key: string | null; needs_estimate: boolean;
};
export type NewFood = Omit<FoodEntry, 'id' | 'date' | 'position' | 'meal_no' | 'needs_estimate'>;

export const listFood = async (date: string) =>
  must(await supabase.from('food_entries').select('*').eq('date', date).order('position')) as FoodEntry[];

/** Adds rows as one new meal (r19: each Add takes max(meal)+1). Day totals update via trigger. */
export const addMeal = async (date: string, rows: NewFood[]) => {
  const existing = await listFood(date);
  const meal = Math.max(0, ...existing.map((r) => r.meal_no ?? 0)) + 1;
  const start = existing.length ? Math.max(...existing.map((r) => r.position)) + 1 : 0;
  // defaultToNull:false so columns a row omits take their DB default, not null.
  return must(
    await supabase.from('food_entries')
      .insert(rows.map((r, i) => ({ ...r, date, meal_no: meal, position: start + i })), { defaultToNull: false })
      .select('*'),
  ) as FoodEntry[];
};

export const updateFood = async (id: string, patch: Partial<NewFood>) => {
  must(await supabase.from('food_entries').update(patch).eq('id', id));
};
export const deleteFood = async (id: string) => {
  must(await supabase.from('food_entries').delete().eq('id', id));
};
export const listPendingFood = async () =>
  must(await supabase.from('food_entries').select('*').eq('needs_estimate', true).order('date')) as FoodEntry[];

// ── Sets ──
export type SetEntry = {
  id: string; date: string; exercise_name: string; program_key: string | null; set_no: number;
  weight_kg: number | null; band_slot: number | null; reps: number | null; is_timed: boolean;
};
export const listSets = async (date: string) =>
  must(await supabase.from('set_entries').select('*').eq('date', date).order('exercise_name').order('set_no')) as SetEntry[];

/** Sets for one exercise name across all days: "last time", progression, bests. */
export const setsForExercise = async (name: string, limit = 200) =>
  must(await supabase.from('set_entries').select('*').eq('exercise_name', name).order('date', { ascending: false }).order('set_no').limit(limit)) as SetEntry[];

export const writeSet = async (
  date: string, exercise_name: string, set_no: number,
  fields: Pick<SetEntry, 'weight_kg' | 'band_slot' | 'reps'> & Partial<Pick<SetEntry, 'program_key' | 'is_timed'>>,
) => {
  if (fields.weight_kg == null && fields.band_slot == null && fields.reps == null) {
    must(await supabase.from('set_entries').delete().match({ date, exercise_name, set_no }));
    return;
  }
  must(await supabase.from('set_entries').upsert({ date, exercise_name, set_no, ...fields }, { onConflict: 'user_id,date,exercise_name,set_no' }));
};

// ── Habits and checks ──
export type Habit = { id: string; name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number; sort: number; archived_at: string | null };
export const listHabits = async () =>
  must(await supabase.from('habits').select('*').is('archived_at', null).order('sort')) as Habit[];
export const listHabitLogs = async (from: string, to: string) =>
  must(await supabase.from('habit_logs').select('habit_id, date, value').gte('date', from).lte('date', to)) as { habit_id: string; date: string; value: number }[];
export const setHabitValue = async (habit_id: string, date: string, value: number | null) => {
  if (value == null) must(await supabase.from('habit_logs').delete().match({ habit_id, date }));
  else must(await supabase.from('habit_logs').upsert({ habit_id, date, value }, { onConflict: 'user_id,habit_id,date' }));
};
export const setCheck = async (date: string, check_id: string, done: boolean) => {
  must(await supabase.from('check_ticks').upsert({ date, check_id, done }, { onConflict: 'user_id,date,check_id' }));
};

// ── Step 2 additions ──
export type MilestoneRow = { goal_id: string; date: string; kind: 'lab' | 'task'; text: string };
export const listMilestones = async (goalId: string) =>
  must(await supabase.from('goal_milestones').select('goal_id, date, kind, text').eq('goal_id', goalId)) as MilestoneRow[];

export type PersonalFood = { id: string; name: string; keywords: string[]; per: 'unit' | '100g'; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
export const listPersonalFoods = async () =>
  must(await supabase.from('personal_foods').select('*')) as PersonalFood[];

/** First logged weight on or after the goal start: r19's START_KG fallback. */
export const firstWeightFrom = async (start: string) => {
  const r = must(await supabase.from('day_logs').select('weight_kg').gte('date', start).not('weight_kg', 'is', null).order('date').limit(1)) as { weight_kg: number }[];
  return r[0]?.weight_kg ?? null;
};

/** PostgREST caps a response at 1000 rows; page through long ranges. */
async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000) {
  const out: T[] = [];
  for (let i = 0; ; i += size) {
    const page = must(await q(i, i + size - 1)) ?? [];
    out.push(...page);
    if (page.length < size) return out;
  }
}

export const listFoodRange = (from: string, to: string) =>
  pageAll<FoodEntry>((a, b) => supabase.from('food_entries').select('*').gte('date', from).lte('date', to).order('date').order('position').order('id').range(a, b));

/** Lightweight set rows for the evidence chips and trained-day checks. */
export const listSetSummary = (from: string, to: string) =>
  pageAll<Pick<SetEntry, 'date' | 'exercise_name' | 'weight_kg' | 'band_slot' | 'reps'>>((a, b) =>
    supabase.from('set_entries').select('date, exercise_name, weight_kg, band_slot, reps').gte('date', from).lte('date', to).order('date').order('id').range(a, b));

export const listTicks = (from: string, to: string) =>
  pageAll<{ date: string; check_id: string; done: boolean }>((a, b) =>
    supabase.from('check_ticks').select('date, check_id, done').gte('date', from).lte('date', to).order('date').order('check_id').range(a, b));

export type UserCheckRow = { id: string; title: string; when_label: string; subtitle: string; builtin_only: boolean; sort: number };
export const listUserChecks = async () => must(await supabase.from('user_checks').select('*').order('sort')) as UserCheckRow[];
export const listHiddenChecks = async () => must(await supabase.from('hidden_checks').select('check_id, label')) as { check_id: string; label: string }[];

// Saved meals: rows are r19 rowCopy snapshots {label, kcal, p, c, f, fib, src, raw}.
export type SavedMealRow = { label: string; kcal: number; p: number; c: number; f: number; fib: number; src: FoodSource; raw: string };
export type SavedMeal = { id: string; name: string; sig: string; rows: SavedMealRow[]; created_at: string };
export const listSavedMeals = async () =>
  must(await supabase.from('saved_meals').select('id, name, sig, rows, created_at').order('created_at', { ascending: false }).limit(12)) as SavedMeal[];
export const saveMeal = async (name: string, sig: string, rows: SavedMealRow[]) => {
  must(await supabase.from('saved_meals').insert({ name: name.slice(0, 30), sig, rows }));
  // r19 keeps the 12 newest.
  const all = must(await supabase.from('saved_meals').select('id').order('created_at', { ascending: false })) as { id: string }[];
  const extra = all.slice(12).map((m) => m.id);
  if (extra.length) must(await supabase.from('saved_meals').delete().in('id', extra));
};
export const deleteSavedMeal = async (id: string) => { must(await supabase.from('saved_meals').delete().eq('id', id)); };

// Estimate cache: personal corrections first, then the shared table.
export type CacheRow = { key: string; name: string; serving_g: number; kcal_100g: number; protein_100g: number; carbs_100g: number; fat_100g: number; fiber_100g: number; unit_only?: boolean; source?: 'claude' | 'you' | 'label' };
export async function lookupCache(keys: string[]) {
  if (!keys.length) return {} as Record<string, CacheRow>;
  const [mine, shared] = await Promise.all([
    supabase.from('food_cache_user').select('*').in('key', keys),
    supabase.from('food_cache_global').select('*').in('key', keys),
  ]);
  const out: Record<string, CacheRow> = {};
  (must(shared) as CacheRow[]).forEach((r) => { out[r.key] = r; });
  (must(mine) as CacheRow[]).forEach((r) => { out[r.key] = r; });
  return out;
}
export const upsertUserCache = async (row: CacheRow) => {
  must(await supabase.from('food_cache_user').upsert(row, { onConflict: 'user_id,key' }));
};
