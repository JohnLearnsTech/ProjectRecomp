// Server-side loaders for the MCP connector. Every query runs through the signed-in user's
// client, so Row Level Security limits it to that person's rows, exactly as in the app.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { makeDays, normUnit, type DayEntry, type Entries, type HabitDef } from './domain/days.ts';
import { addDays, d, key } from './domain/dates.ts';
import { buildFoodIndex, cacheKeyOf, fromEntry, isDish, matchFood, parseGrams, parseItem, portionOf, scaleEst, splitFoodInput, type CacheRec } from './domain/food.ts';
import { makeEngine, normPlan, provisionalGoal } from './domain/plan.ts';
import { defaultBands } from './domain/training.ts';
import type { FoodDef, Goal, Profile } from './domain/types.ts';

type DB = SupabaseClient;
const must = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
const round1 = (x: number) => Math.round(x * 10) / 10;

/** The person's own calendar date, from the time zone the app saved. */
export function todayFor(tz: string | null | undefined, now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

export async function loadContext(sb: DB) {
  const [p, active, foods, planRow, habitRows] = await Promise.all([
    sb.from('profiles').select('*').maybeSingle(), sb.from('goals').select('*').eq('status', 'active').maybeSingle(),
    sb.from('personal_foods').select('*'), sb.from('plans').select('*').eq('is_current', true).maybeSingle(),
    sb.from('habits').select('*').is('archived_at', null).order('sort'),
  ]);
  const profileRow = must(p) as any;
  let g = must(active) as any;
  if (!g) g = must(await sb.from('goals').select('*').order('sort', { ascending: false }).limit(1).maybeSingle());
  const today = todayFor(profileRow?.timezone);
  const ms = g ? (must(await sb.from('goal_milestones').select('date, kind, text').eq('goal_id', g.id)) as any[]) : [];
  const goal: Goal = g ? {
    id: g.id, name: g.name, why: g.why, type: g.type, start: g.start_date, due: g.due_date, event: g.event_date, trainStart: g.train_start_date,
    startKg: g.start_kg, targetKg: g.target_kg, kcal: g.kcal, protein: g.protein_g, steps: g.steps, homeFirst: g.home_first, done: g.status === 'done',
    milestones: ms.map((m) => ({ d: m.date, k: m.kind, t: m.text })),
  } : provisionalGoal(today);
  const myFoods: FoodDef[] = (must(foods) as any[]).map((f) => ({ n: f.name, k: f.keywords, per: f.per, g: +f.grams, v: [+f.kcal, +f.protein_g, +f.carbs_g, +f.fat_g, +f.fiber_g] }));
  const profile: Profile = {
    name: profileRow?.name, sex: !profileRow || profileRow.sex === 'unspecified' ? '' : profileRow.sex, equip: profileRow?.equipment, days: profileRow?.training_days,
    waistDay: profileRow?.waist_weekday, waterL: profileRow?.water_l, kcalFloor: profileRow?.kcal_floor, proteinFloor: profileRow?.protein_floor, myFoods,
    cuisine: profileRow?.cuisine, heightCm: profileRow?.height_cm, age: profileRow?.age, jointFriendly: profileRow?.joint_friendly, rules: profileRow?.rules,
  };
  const pr = must(planRow) as any;
  let firstW: number | null = null;
  if (!goal.startKg) {
    const w = must(await sb.from('day_logs').select('weight_kg').gte('date', goal.start).not('weight_kg', 'is', null).order('date').limit(1)) as any[];
    firstW = w[0]?.weight_kg ?? null;
  }
  const engine = makeEngine(goal, profile, pr ? normPlan(pr.body) : null, firstW);
  const maxDay = today < goal.start ? goal.start : today > goal.due ? goal.due : today;
  const habits: HabitDef[] = (must(habitRows) as any[]).map((h) => ({ id: h.id, name: h.name, type: h.type, unit: normUnit(h.unit), goal: +h.goal, step: +h.step > 0 ? +h.step : 1 }));
  const bands = profileRow?.bands?.length === 5 ? profileRow.bands : defaultBands();
  return { profileRow, goalRow: g, goal, profile, engine, today, maxDay, habits, bands, savedPlan: !!pr, foodIndex: buildFoodIndex(myFoods) };
}
export type Ctx = Awaited<ReturnType<typeof loadContext>>;

async function pageAll<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) { const page = must(await q(i, i + 999)) ?? []; out.push(...page); if (page.length < 1000) return out; }
}

/** r19 entries for a date range, built the same way as the app's lib/days.ts. */
export async function loadEntries(sb: DB, from: string, to: string): Promise<Entries> {
  const [logs, food, sets, hl, ticks] = await Promise.all([
    pageAll<any>((a, b) => sb.from('day_logs').select('*').gte('date', from).lte('date', to).order('date').range(a, b)),
    pageAll<any>((a, b) => sb.from('food_entries').select('date, id').gte('date', from).lte('date', to).order('date').order('id').range(a, b)),
    pageAll<any>((a, b) => sb.from('set_entries').select('*').gte('date', from).lte('date', to).order('date').order('exercise_name').order('set_no').range(a, b)),
    pageAll<any>((a, b) => sb.from('habit_logs').select('habit_id, date, value').gte('date', from).lte('date', to).order('date').order('habit_id').range(a, b)),
    pageAll<any>((a, b) => sb.from('check_ticks').select('date, check_id, done').gte('date', from).lte('date', to).order('date').order('check_id').range(a, b)),
  ]);
  const E: Entries = {}; const at = (k: string): DayEntry => (E[k] ||= {});
  logs.forEach((l) => {
    const e = at(l.date);
    if (l.weight_kg != null) e.w = +l.weight_kg; if (l.steps != null) e.steps = l.steps; if (l.sleep_h != null) e.sleep = +l.sleep_h;
    if (l.waist_cm != null) e.waist = +l.waist_cm; if (l.kcal_total != null) e.kcal = l.kcal_total; if (l.protein_total_g != null) e.protein = l.protein_total_g;
  });
  food.forEach((f) => { (at(f.date).food ||= []).push(f.id); });
  sets.forEach((r) => {
    const arr = ((at(r.date).sets ||= {})[r.exercise_name] ||= []);
    while (arr.length < r.set_no) arr.push({});
    const x: any = {}; if (r.weight_kg != null) x.w = +r.weight_kg; if (r.reps != null) x.r = +r.reps; if (r.band_slot != null) x.b = r.band_slot;
    arr[r.set_no - 1] = x;
  });
  hl.forEach((h) => { (at(h.date).habits ||= {})[h.habit_id] = +h.value; });
  ticks.forEach((t) => { (at(t.date).checks ||= {})[t.check_id] = t.done; });
  return E;
}

export async function daysFor(sb: DB, ctx: Ctx) {
  const entries = await loadEntries(sb, ctx.engine.T.START, ctx.engine.T.END);
  return { entries, D: makeDays({ entries, engine: ctx.engine, MAXDAY: ctx.maxDay, habits: ctx.habits, bands: ctx.bands }) };
}

/** Adds rows as one new meal (r19: each Add takes max(meal)+1). */
export async function addMeal(sb: DB, date: string, rows: Record<string, unknown>[]) {
  const ex = must(await sb.from('food_entries').select('meal_no, position').eq('date', date)) as any[];
  const meal = Math.max(0, ...ex.map((r) => r.meal_no ?? 0)) + 1, start = ex.length ? Math.max(...ex.map((r) => r.position)) + 1 : 0;
  return must(await sb.from('food_entries').insert(rows.map((r, i) => ({ ...r, date, meal_no: meal, position: start + i })), { defaultToNull: false }).select('id, label, kcal, protein_g, source, needs_estimate')) as any[];
}

const recOf = (r: any): CacheRec => ({ name: r.name, serving_g: +r.serving_g, by: r.source === 'you' || r.source === 'label' ? 'you' : null, unitOnly: !!r.unit_only,
  per100: { kcal: +r.kcal_100g, p: +r.protein_100g, c: +r.carbs_100g, f: +r.fat_100g, fib: +r.fiber_100g } });

/** The app's addFoodText: your foods and the table, then remembered estimates, else no numbers yet. */
export async function logFoodText(sb: DB, ctx: Ctx, date: string, raw: string) {
  const parts = splitFoodInput(raw.trim());
  const rows: Record<string, unknown>[] = new Array(parts.length); const unknown: number[] = [];
  parts.forEach((p, i) => {
    const it = parseItem(p), f = matchFood(it.name, ctx.foodIndex);
    if (!f) { unknown.push(i); return; }
    const r = fromEntry(it, f);
    rows[i] = { label: r.label, raw_text: p, grams: round1(r.grams), kcal: round1(r.kcal), protein_g: round1(r.p), carbs_g: round1(r.c), fat_g: round1(r.f), fiber_g: round1(r.fib), source: 'table', cache_key: cacheKeyOf(p) };
  });
  const keys = [...new Set(unknown.filter((i) => !isDish(parts[i])).map((i) => cacheKeyOf(parts[i])).filter((k): k is string => !!k))];
  const cache: Record<string, any> = {};
  if (keys.length) {
    (must(await sb.from('food_cache_global').select('*').in('key', keys)) as any[]).forEach((r) => { cache[r.key] = r; });
    (must(await sb.from('food_cache_user').select('*').in('key', keys)) as any[]).forEach((r) => { cache[r.key] = r; });
  }
  unknown.forEach((i) => {
    const p = parts[i], k = cacheKeyOf(p), hit = !isDish(p) && k ? cache[k] : undefined;
    if (hit) { const rec = recOf(hit), po = portionOf(p, rec), e = scaleEst(rec, po.g, po.n);
      rows[i] = { label: e.label, raw_text: p, grams: round1(po.g), kcal: e.kcal, protein_g: e.p, carbs_g: e.c, fat_g: e.f, fiber_g: e.fib, source: e.by === 'you' ? 'you' : 'claude', cache_key: k }; }
    else rows[i] = { label: p, raw_text: p, grams: parseGrams(p), kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, source: 'none', cache_key: isDish(p) ? null : k };
  });
  return rows.length ? addMeal(sb, date, rows) : [];
}

export const daysBack = (k: string, n: number) => key(addDays(d(k), -n));
