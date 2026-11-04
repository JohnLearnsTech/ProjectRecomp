// Me > Backup: the r19 backup file (recomp-backup-<date>.json, the same shape the restore reads)
// and the three CSV exports (r19 exportFile: daily, food, sets), shared through Android's share sheet.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Engine } from '../domain/plan';
import type { Days } from '../domain/days';
import { trimNum } from '../domain/dates';
import { pageAll } from './db';
import { supabase } from './supabase';

const all = <T,>(table: string, order: string[]) =>
  pageAll<T>((a, b) => { let q = supabase.from(table).select('*'); order.forEach((o) => { q = q.order(o); }); return q.range(a, b); });
const ms = (t: string | null) => (t ? new Date(t).getTime() : null);

export async function buildBackup() {
  const [profile] = await all<any>('profiles', ['user_id']);
  const [notes, history, foods, goals, milestones, plans, swaps, days, food, sets, habits, hlogs, hsess, checks, hidden, ticks, cache, meals, reviews, rems, legacy] = await Promise.all([
    all<any>('profile_notes', ['sort']), all<any>('weight_history', ['date']), all<any>('personal_foods', ['name']), all<any>('goals', ['sort']), all<any>('goal_milestones', ['date']),
    all<any>('plans', ['version']), all<any>('exercise_swaps', ['program_key']), all<any>('day_logs', ['date']), all<any>('food_entries', ['date', 'position', 'id']),
    all<any>('set_entries', ['date', 'exercise_name', 'set_no']), all<any>('habits', ['sort']), all<any>('habit_logs', ['date']), all<any>('habit_sessions', ['date', 'started_at']),
    all<any>('user_checks', ['sort']), all<any>('hidden_checks', ['check_id']), all<any>('check_ticks', ['date']), all<any>('food_cache_user', ['key']),
    all<any>('saved_meals', ['sort']), all<any>('reviews', ['end_date']), all<any>('reminders', ['key']), all<any>('legacy_calendar_events', ['id']),
  ]);
  const entries: Record<string, any> = {};
  const at = (k: string) => (entries[k] ||= {});
  days.forEach((l) => {
    const e = at(l.date);
    if (l.weight_kg != null) e.w = +l.weight_kg; if (l.steps != null) e.steps = l.steps; if (l.sleep_h != null) e.sleep = +l.sleep_h;
    if (l.waist_cm != null) e.waist = +l.waist_cm; if (l.note) e.note = l.note; if (l.kcal_total != null) e.kcal = l.kcal_total; if (l.protein_total_g != null) e.protein = l.protein_total_g;
  });
  food.forEach((r) => {
    const row: any = { label: r.label, kcal: +r.kcal, p: +r.protein_g, c: +r.carbs_g, f: +r.fat_g, fib: +r.fiber_g, src: r.source };
    if (r.raw_text) row.raw = r.raw_text; if (r.meal_no != null) row.meal = r.meal_no;
    (at(r.date).food ||= []).push(row);
  });
  sets.forEach((s) => {
    const day = (at(s.date).sets ||= {}), arr = (day[s.exercise_name] ||= []);
    while (arr.length < s.set_no) arr.push({});
    const x: any = {}; if (s.weight_kg != null) x.w = +s.weight_kg; if (s.reps != null) x.r = +s.reps; if (s.band_slot != null) x.b = s.band_slot;
    arr[s.set_no - 1] = x;
  });
  hlogs.forEach((h) => { (at(h.date).habits ||= {})[h.habit_id] = +h.value; });
  hsess.forEach((h) => { ((at(h.date).hlog ||= {})[h.habit_id] ||= []).push({ s: ms(h.started_at), e: ms(h.ended_at) }); });
  ticks.forEach((t) => { (at(t.date).checks ||= {})[t.check_id] = t.done; });
  const cur = plans.find((p) => p.is_current), prev = cur?.prev_version != null ? plans.find((p) => p.version === cur.prev_version) : null;
  const est: Record<string, any> = {};
  cache.forEach((c) => { est[c.key] = { name: c.name, serving_g: +c.serving_g, unitOnly: c.unit_only, by: c.source, per100: { kcal: +c.kcal_100g, p: +c.protein_100g, c: +c.carbs_100g, f: +c.fat_100g, fib: +c.fiber_100g } }; });
  const items: Record<string, any> = {}; rems.forEach((r) => { items[r.key] = { on: r.enabled, time: String(r.local_time).slice(0, 5) }; });
  return {
    app: 'recomp', version: 1, exportedAt: new Date().toISOString(),
    goals: goals.map((g) => ({ id: g.id, name: g.name, why: g.why, type: g.type, start: g.start_date, due: g.due_date, event: g.event_date, trainStart: g.train_start_date,
      startKg: g.start_kg == null ? null : +g.start_kg, targetKg: g.target_kg == null ? null : +g.target_kg, endKg: g.end_kg == null ? undefined : +g.end_kg,
      kcal: g.kcal, protein: g.protein_g, steps: g.steps, homeFirst: g.home_first, done: g.status === 'done',
      milestones: milestones.filter((m) => m.goal_id === g.id).map((m) => ({ d: m.date, k: m.kind, t: m.text })) })),
    plan: cur?.body ?? null,
    planPrev: cur ? { plan: prev?.body ?? null, kcal: cur.prev_kcal, protein: cur.prev_protein } : null,
    habits: habits.filter((h) => !h.archived_at).map((h) => ({ id: h.id, name: h.name, type: h.type, unit: h.unit, goal: +h.goal, step: +h.step })),
    keystone: profile?.keystone_habit_id ?? null,
    userChecks: checks.map((u) => ({ id: u.id, t: u.title, w: u.when_label, s: u.subtitle, ...(u.builtin_only ? { builtinOnly: true } : {}) })),
    hiddenChecks: Object.fromEntries(hidden.map((h) => [h.check_id, h.label === h.check_id ? true : h.label])),
    bands: profile?.bands ?? null,
    swaps: Object.fromEntries(swaps.map((s) => [s.program_key + '|' + s.original_name, s.alternate_name])),
    savedMeals: meals.map((m) => ({ id: m.id, name: m.name, sig: m.sig, rows: m.rows })),
    estCache: est,
    reminders: { items, events: legacy.map((e) => ({ k: e.item_key, id: e.event_id, title: e.title })), tag: legacy[0]?.tag ?? null },
    profile: profile && {
      name: profile.name ?? '', sex: profile.sex === 'unspecified' ? '' : profile.sex, age: profile.age, heightCm: profile.height_cm == null ? null : +profile.height_cm,
      cuisine: profile.cuisine ?? '', waterL: profile.water_l == null ? null : +profile.water_l, kcalFloor: profile.kcal_floor, proteinFloor: profile.protein_floor,
      jointFriendly: profile.joint_friendly, rules: profile.rules ?? '', equip: profile.equipment, days: profile.training_days, waistDay: profile.waist_weekday, setupAt: ms(profile.setup_at),
      notes: notes.map((n) => ({ id: n.id, group: n.group_name, title: n.title, body: n.body })),
      history: history.map((h) => ({ d: h.date, kg: +h.kg, note: h.note ?? '' })),
      myFoods: foods.map((f) => ({ n: f.name, k: f.keywords, per: f.per, g: +f.grams, v: [+f.kcal, +f.protein_g, +f.carbs_g, +f.fat_g, +f.fiber_g] })),
    },
    reviews: reviews.map((r) => ({ id: r.end_date, at: ms(r.created_at), from: r.start_date, to: r.end_date, applied: !!r.applied_at, stats: r.stats, out: r.out })),
    entries,
  };
}

const csv = (rows: unknown[][]) => rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');

/** r19 exportFile: one of json, daily, food, sets. */
export async function exportFile(kind: 'json' | 'daily' | 'food' | 'sets', engine: Engine, D: Days, maxDay: string) {
  const b = await buildBackup();
  const E = b.entries, ks = Object.keys(E).filter((k) => k <= maxDay).sort();
  let name: string, data: string, mime = 'text/csv';
  if (kind === 'json') { name = `recomp-backup-${maxDay}.json`; data = JSON.stringify(b, null, 1); mime = 'application/json'; }
  else if (kind === 'daily') {
    name = `recomp-daily-${maxDay}.csv`;
    const hl = b.habits;
    const rows: unknown[][] = [['date', 'weight_kg', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'steps', 'sleep_h', 'waist_cm', 'plan', 'session_done', 'checks_done', 'checks_total',
      ...hl.map((h) => `habit: ${h.name} (${h.unit || ''})`), 'note']];
    ks.forEach((k) => {
      const e = E[k] || {}, pl = engine.plan(k); let c = 0, f = 0, fb = 0;
      (e.food || []).forEach((r: any) => { c += +r.c || 0; f += +r.f || 0; fb += +r.fib || 0; });
      const cl = engine.checkList(pl); const tk = cl.filter((x) => e.checks && e.checks[x.id]).length;
      rows.push([k, e.w, e.kcal, e.protein, e.food ? Math.round(c) : '', e.food ? Math.round(f) : '', e.food ? Math.round(fb) : '', e.steps, e.sleep, e.waist,
        pl.session ? engine.NAMES[pl.session] : pl.type, D.trainedOn(k) ? 'yes' : '', tk, cl.length, ...hl.map((h) => e.habits?.[h.id] ?? ''), e.note || '']);
    });
    data = csv(rows);
  } else if (kind === 'food') {
    name = `recomp-food-${maxDay}.csv`;
    const rows: unknown[][] = [['date', 'meal', 'item', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'source', 'what_you_typed']];
    ks.forEach((k) => (E[k].food || []).forEach((r: any) => rows.push([k, r.meal ?? '', r.label, Math.round(+r.kcal || 0), trimNum(+r.p || 0), trimNum(+r.c || 0), trimNum(+r.f || 0), trimNum(+r.fib || 0), r.src || '', r.raw || ''])));
    data = csv(rows);
  } else {
    name = `recomp-sets-${maxDay}.csv`;
    const rows: unknown[][] = [['date', 'session', 'exercise', 'set', 'weight_kg', 'reps', 'band']];
    ks.forEach((k) => { const pl = engine.plan(k); Object.keys(E[k].sets || {}).forEach((ex) => (E[k].sets[ex] as any[]).forEach((x, i) => {
      if (x && (x.w != null || x.r != null || x.b != null)) rows.push([k, pl.session ? engine.NAMES[pl.session] : '', ex, i + 1, x.w ?? '', x.r ?? '', x.b ?? '']);
    })); });
    data = csv(rows);
  }
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([data], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
    return name;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create(); file.write(data);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
  return name;
}
