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
  timezone?: string | null;
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
export async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, size = 1000) {
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

// ── Setup ──
export type OnboardingPayload = {
  day: string; weight_kg: number;
  goal: { name: string; type: GoalType; due_date: string; target_kg: number; kcal: number; protein_g: number; steps: number; home_first: boolean };
  profile: { name: string; sex: Sex; age: number; height_cm: number; cuisine: string; equipment: 'gym' | 'home' | 'body'; training_days: number; joint_friendly: boolean };
  habits: { name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number }[];
};
/** One transaction: closes the active goal, starts the new one, updates profile, habits, today's weight, plan. */
export const finishOnboarding = async (p: OnboardingPayload) => must(await supabase.rpc('finish_onboarding', { p })) as string;

/** Latest goal of any status: r19 activeGoal() falls back to the last goal when none is live. */
export const getLatestGoal = async () =>
  must(await supabase.from('goals').select('*').order('sort', { ascending: false }).limit(1).maybeSingle()) as Goal | null;

/** r19 latestWeight(): last weigh-in inside a window. */
export const latestWeightIn = async (from: string, to: string) => {
  const r = must(await supabase.from('day_logs').select('weight_kg').gte('date', from).lte('date', to).not('weight_kg', 'is', null).order('date', { ascending: false }).limit(1)) as { weight_kg: number }[];
  return r[0]?.weight_kg ?? null;
};

// ── Training ──
export const listSwaps = async () =>
  must(await supabase.from('exercise_swaps').select('program_key, original_name, alternate_name')) as { program_key: string; original_name: string; alternate_name: string }[];
/** alternate null = back to the default exercise. */
export const setSwap = async (program_key: string, original_name: string, alternate_name: string | null) => {
  if (!alternate_name) must(await supabase.from('exercise_swaps').delete().match({ program_key, original_name }));
  else must(await supabase.from('exercise_swaps').upsert({ program_key, original_name, alternate_name }, { onConflict: 'user_id,program_key,original_name' }));
};
export const updateBands = async (bands: { n: string; kg: number | null }[]) => updateProfile({ bands });

/** Every logged set for these exercise names, any date: history, last time, bests and volume. */
export const listSetsForNames = (names: string[]) =>
  names.length
    ? pageAll<SetEntry>((a, b) => supabase.from('set_entries').select('*').in('exercise_name', names).order('date').order('exercise_name').order('set_no').range(a, b))
    : Promise.resolve([] as SetEntry[]);

// ── Step 4: habits and history ──
export const listHabitsAll = async () => must(await supabase.from('habits').select('*').order('sort')) as Habit[];
export const addHabit = async (h: { name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number }) => {
  const all = await listHabitsAll();
  must(await supabase.from('habits').insert({ ...h, sort: all.length ? Math.max(...all.map((x) => x.sort)) + 1 : 0 }));
};
export const updateHabit = async (id: string, patch: Partial<Pick<Habit, 'name' | 'goal' | 'step' | 'sort' | 'archived_at'>>) => {
  must(await supabase.from('habits').update(patch).eq('id', id));
};
export const setKeystone = async (id: string | null) => updateProfile({ keystone_habit_id: id });

export type HabitSession = { id: string; habit_id: string; date: string; started_at: string; ended_at: string; source: 'timer' | 'pomodoro' };
export const listHabitSessions = async (date: string) =>
  must(await supabase.from('habit_sessions').select('id, habit_id, date, started_at, ended_at, source').eq('date', date).order('started_at')) as HabitSession[];
export const listHabitSessionsRange = async (from: string, to: string, habitIds: string[]) =>
  habitIds.length ? must(await supabase.from('habit_sessions').select('id, habit_id, date, started_at, ended_at, source').gte('date', from).lte('date', to).in('habit_id', habitIds).eq('source', 'timer').order('started_at')) as HabitSession[] : [];
export const addHabitSessions = async (rows: { habit_id: string; date: string; started_at: string; ended_at: string; source: 'timer' | 'pomodoro' }[]) => {
  if (rows.length) must(await supabase.from('habit_sessions').insert(rows));
};
export const deleteHabitSession = async (id: string) => { must(await supabase.from('habit_sessions').delete().eq('id', id)); };
export const deleteHabitSessionsFor = async (habit_id: string, date: string) => { must(await supabase.from('habit_sessions').delete().match({ habit_id, date })); };

export const listHabitLogsRange = (from: string, to: string) =>
  pageAll<{ habit_id: string; date: string; value: number }>((a, b) =>
    supabase.from('habit_logs').select('habit_id, date, value').gte('date', from).lte('date', to).order('date').order('habit_id').range(a, b));
export const listFoodDates = (from: string, to: string) =>
  pageAll<{ date: string; id: string }>((a, b) => supabase.from('food_entries').select('date, id').gte('date', from).lte('date', to).order('date').order('id').range(a, b));
export const listSetsRange = (from: string, to: string) =>
  pageAll<SetEntry>((a, b) => supabase.from('set_entries').select('*').gte('date', from).lte('date', to).order('date').order('exercise_name').order('set_no').range(a, b));

// ── Step 5: Claude features ──
export type ReviewRow = { end_date: string; start_date: string; stats: any; out: any; change_kcal: number | null; change_steps: number | null; applied_at: string | null; created_at: string };
export const getLatestReview = async () =>
  must(await supabase.from('reviews').select('*').order('end_date', { ascending: false }).limit(1).maybeSingle()) as ReviewRow | null;
export const saveReview = async (r: Omit<ReviewRow, 'created_at' | 'applied_at'>) => {
  must(await supabase.from('reviews').upsert({ ...r, applied_at: null }, { onConflict: 'user_id,end_date' }));
};
export const markReviewApplied = async (end_date: string) => { must(await supabase.from('reviews').update({ applied_at: new Date().toISOString() }).eq('end_date', end_date)); };
/** New plan version plus goal targets, in one transaction (save_plan). */
export const savePlanVersion = async (p: { body: unknown | null; source: 'claude' | 'you'; note: string; kcal?: number | null; protein?: number | null }) =>
  must(await supabase.rpc('save_plan', { p })) as number;
export const restorePreviousPlan = async () => must(await supabase.rpc('restore_previous_plan')) as number | null;
export const updateGoalTargets = async (id: string, patch: Partial<Pick<Goal, 'kcal' | 'protein_g' | 'steps'>>) => {
  must(await supabase.from('goals').update(patch).eq('id', id));
};
export const addPersonalFood = async (f: Omit<PersonalFood, 'id'>) => { must(await supabase.from('personal_foods').insert(f)); };

// ── Step 6: connector ──
export type ProposalRow = { id: string; origin: 'app' | 'connector'; summary: string; body: unknown; kcal: number | null; protein_g: number | null; status: string; created_at: string };
export const listPendingProposals = async () =>
  must(await supabase.from('plan_proposals').select('*').eq('status', 'pending').order('created_at', { ascending: false })) as ProposalRow[];
export const decideProposal = async (id: string, status: 'applied' | 'dismissed') => {
  must(await supabase.from('plan_proposals').update({ status, decided_at: new Date().toISOString() }).eq('id', id));
};

// ── Step 7: r19 backup restore (replaces everything in this account, one transaction) ──
export const importBackup = async (p: unknown) => must(await supabase.rpc('import_backup', { p })) as Record<string, any>;

// ── Me tabs (Goal, Notes, About you, Reminders) ──
export type GoalPatch = Partial<Pick<Goal, 'name' | 'why' | 'start_date' | 'due_date' | 'event_date' | 'train_start_date' | 'start_kg' | 'target_kg' | 'kcal' | 'protein_g' | 'steps' | 'home_first'>>;
export const updateGoal = async (id: string, patch: GoalPatch) => { must(await supabase.from('goals').update(patch).eq('id', id)); };
export const listGoals = async () => must(await supabase.from('goals').select('*').order('sort')) as Goal[];
export const finishGoal = async (p: { end_kg: number | null; start: string; due: string; start_kg: number | null; target_kg: number | null }) =>
  must(await supabase.rpc('finish_goal', { p })) as string;
export type MilestoneFull = MilestoneRow & { id: string };
export const listMilestonesFull = async (goalId: string) =>
  must(await supabase.from('goal_milestones').select('id, goal_id, date, kind, text').eq('goal_id', goalId).order('date')) as MilestoneFull[];
export const addMilestone = async (m: MilestoneRow) => { must(await supabase.from('goal_milestones').insert(m)); };
export const deleteMilestone = async (id: string) => { must(await supabase.from('goal_milestones').delete().eq('id', id)); };
/** Edits the current plan in place (r19 changes planSaved.phases[].steps when the goal's steps move). */
export const updateCurrentPlanBody = async (body: unknown) => { must(await supabase.from('plans').update({ body }).eq('is_current', true)); };

export type Note = { id: string; group_name: string; title: string; body: string; sort: number };
export const listNotes = async () => must(await supabase.from('profile_notes').select('id, group_name, title, body, sort').order('sort')) as Note[];
export const upsertNote = async (n: Note) => { must(await supabase.from('profile_notes').upsert(n, { onConflict: 'user_id,id' })); };
export const deleteNote = async (id: string) => { must(await supabase.from('profile_notes').delete().eq('id', id)); };

export type WeighIn = { date: string; kg: number; note: string | null };
export const listWeightHistory = async () => must(await supabase.from('weight_history').select('date, kg, note').order('date')) as WeighIn[];
export const upsertWeighIn = async (w: WeighIn) => { must(await supabase.from('weight_history').upsert(w, { onConflict: 'user_id,date' })); };
export const deleteWeighIn = async (date: string) => { must(await supabase.from('weight_history').delete().eq('date', date)); };

export type ReminderRow = { key: string; enabled: boolean; local_time: string };
export const listReminders = async () => must(await supabase.from('reminders').select('key, enabled, local_time')) as ReminderRow[];
export const setReminder = async (r: ReminderRow) => { must(await supabase.from('reminders').upsert(r, { onConflict: 'user_id,key' })); };
