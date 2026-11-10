// Food logging on top of the r19 pipeline (domain/food.ts) and the database (db.ts).
import {
  buildFoodIndex, cacheKeyOf, fromEntry, isDish, matchFood, parseGrams, parseItem, portionOf, scaleEst, splitFoodInput,
  type CacheRec,
} from '../domain/food';
import type { FoodRow } from '../domain/types';
import * as db from './db';

export const toRow = (e: db.FoodEntry): FoodRow & { id: string; needs_estimate: boolean; position: number; at: string | null } => ({
  id: e.id, position: e.position, at: e.eaten_at ?? null, label: e.label, raw: e.raw_text ?? undefined, kcal: +e.kcal, p: +e.protein_g, c: +e.carbs_g,
  f: +e.fat_g, fib: +e.fiber_g, meal: e.meal_no, src: e.source, needs_estimate: e.needs_estimate,
});

const recOf = (r: db.CacheRow): CacheRec => ({
  name: r.name, serving_g: +r.serving_g, by: r.source === 'you' || r.source === 'label' ? 'you' : null, unitOnly: !!r.unit_only,
  per100: { kcal: +r.kcal_100g, p: +r.protein_100g, c: +r.carbs_100g, f: +r.fat_100g, fib: +r.fiber_100g },
});

export type AddResult = { table: number; cached: number; pending: number };

/**
 * r19 addFood(): split the text, match each item against your foods and the built-in table,
 * then the estimate cache (what r19's estimate() checks before calling Claude). Anything left
 * is saved with no numbers (needs_estimate) so it shows in the log at once and is never dropped.
 */
export async function addFoodText(date: string, raw: string, index: ReturnType<typeof buildFoodIndex>): Promise<AddResult> {
  const parts = splitFoodInput(raw.trim());
  if (!parts.length) return { table: 0, cached: 0, pending: 0 };
  const rows: db.NewFood[] = new Array(parts.length);
  const unknown: number[] = [];
  parts.forEach((p, i) => {
    const it = parseItem(p), f = matchFood(it.name, index);
    if (!f) { unknown.push(i); return; }
    const r = fromEntry(it, f);
    rows[i] = { label: r.label, raw_text: p, grams: round1(r.grams), kcal: round1(r.kcal), protein_g: round1(r.p), carbs_g: round1(r.c), fat_g: round1(r.f), fiber_g: round1(r.fib), source: 'table', cache_key: cacheKeyOf(p) };
  });
  const keys = unknown.filter((i) => !isDish(parts[i])).map((i) => cacheKeyOf(parts[i])).filter((k): k is string => !!k);
  const cache = await db.lookupCache([...new Set(keys)]);
  let cached = 0;
  unknown.forEach((i) => {
    const p = parts[i], k = cacheKeyOf(p), hit = !isDish(p) && k ? cache[k] : undefined;
    if (hit) {
      const rec = recOf(hit), po = portionOf(p, rec), e = scaleEst(rec, po.g, po.n);
      rows[i] = { label: e.label, raw_text: p, grams: round1(po.g), kcal: e.kcal, protein_g: e.p, carbs_g: e.c, fat_g: e.f, fiber_g: e.fib, source: e.by === 'you' ? 'you' : 'claude', cache_key: k };
      cached++;
    } else {
      rows[i] = { label: p, raw_text: p, grams: parseGrams(p), kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, source: 'none', cache_key: isDish(p) ? null : k };
    }
  });
  await db.addMeal(date, rows);
  return { table: parts.length - unknown.length, cached, pending: unknown.length - cached };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Copies saved-meal or recent-meal rows into the day as a new meal (r19 addMealRows). */
export async function addMealRows(date: string, rows: (FoodRow & { grams?: number | null })[]) {
  await db.addMeal(date, rows.map((r) => ({
    label: r.label, raw_text: r.raw ?? r.label, grams: r.grams ?? null, kcal: +r.kcal || 0, protein_g: +r.p || 0, carbs_g: +r.c || 0,
    fat_g: +r.f || 0, fiber_g: +r.fib || 0, source: (r.src && r.src !== 'pending' ? r.src : 'you') as db.FoodSource, cache_key: cacheKeyOf(r.raw ?? r.label),
  })));
}

/**
 * r19 rememberFood(): a corrected row is cached per 100 g so the same food is instant next
 * time. With no weight in the text, one piece is stored (unitOnly), so "4 eggs" prices as 4.
 */
export async function rememberFood(raw: string, label: string, r: { kcal: number; p: number; c: number; f: number; fib: number }, grams: number | null) {
  const k = cacheKeyOf(raw);
  if (!k) return;
  const g0 = grams || parseGrams(raw);
  const cnt = g0 ? null : parseItem(raw).count || 1;
  const g = g0 || 100 * (cnt as number);
  const s = 100 / g;
  await db.upsertUserCache({
    key: k, name: label.replace(/\s*\([^()]*\)\s*$/, '').trim().slice(0, 80) || raw, serving_g: g0 ? g0 : 100, unit_only: !g0, source: 'you',
    kcal_100g: round1(r.kcal * s), protein_100g: round1(r.p * s), carbs_100g: round1(r.c * s), fat_100g: round1(r.f * s), fiber_100g: round1(r.fib * s),
  });
}
