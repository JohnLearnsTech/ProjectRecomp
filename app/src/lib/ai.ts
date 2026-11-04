// Claude features on top of the database: r19's estimate / bulkAsk, label scan, plate photo,
// plan builder and weekly review, using the prompts and checks in domain/ai.ts.
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  AiError, buildProposal, compactPlan, foodEstimatePrompt, LABEL_PROMPT, minus, normReview, planPrompt, planRules, planWeekdays, platePrompt, r1,
  readEstimates, readLabel, readPlate, reviewPrompt, type AiProfile, type Per100, type Proposal,
} from '../domain/ai';
import { trimNum } from '../domain/dates';
import type { Days } from '../domain/days';
import { cacheKeyOf, isDish, normFood, parseItem, portionOf, scaleEst, type CacheRec } from '../domain/food';
import { defaultPlanFor, kcalFloor, proteinFloor, type Engine } from '../domain/plan';
import { getApiKey } from './apiKey';
import { askJson, setKeySource } from './claude';
import * as db from './db';

setKeySource(getApiKey);
export const hasKey = async () => !!(await getApiKey());

const round1 = (x: number) => Math.round(x * 10) / 10;
const recOf = (r: db.CacheRow): CacheRec => ({ name: r.name, serving_g: +r.serving_g, by: r.source === 'you' || r.source === 'label' ? 'you' : null, unitOnly: !!r.unit_only,
  per100: { kcal: +r.kcal_100g, p: +r.protein_100g, c: +r.carbs_100g, f: +r.fat_100g, fib: +r.fiber_100g } });

/**
 * r19 estimate(): the cache first (your corrections, then shared estimates), then one Claude
 * call for the rest. Each estimate is remembered per 100 g under its cache key and added to
 * your own food list, so the same food is instant next time. Dishes with listed ingredients
 * are never cached, as in r19. Returns how many rows got numbers.
 */
export async function estimateRows(rows: db.FoodEntry[], cuisine: string | null | undefined) {
  if (!rows.length) return 0;
  const descs = rows.map((r) => r.raw_text || r.label);
  const keys = descs.map((d0) => (isDish(d0) ? null : cacheKeyOf(d0)));
  const cache = await db.lookupCache([...new Set(keys.filter((k): k is string => !!k))]);
  const out: ({ label: string; by: 'you' | null; kcal: number; p: number; c: number; f: number; fib: number; grams: number } | null)[] = new Array(rows.length).fill(null);
  const miss: number[] = [];
  descs.forEach((d0, i) => {
    const hit = keys[i] ? cache[keys[i]!] : undefined;
    if (hit) { const rec = recOf(hit), po = portionOf(d0, rec); out[i] = { ...scaleEst(rec, po.g, po.n), grams: po.g }; } else miss.push(i);
  });
  if (miss.length) {
    const list = miss.map((i) => descs[i]);
    const recs = readEstimates(await askJson(foodEstimatePrompt(list, cuisine), { effort: 'low', maxTokens: 16000, timeoutMs: 60000 }), list);
    for (let j = 0; j < miss.length; j++) {
      const rec = recs[j], i = miss[j]; if (!rec) continue;
      const po = portionOf(descs[i], rec); out[i] = { ...scaleEst(rec, po.g, po.n), grams: po.g };
      if (!isDish(descs[i]) && keys[i]) {
        await db.upsertUserCache({ key: keys[i]!, name: rec.name.slice(0, 80), serving_g: rec.serving_g, unit_only: false, source: 'claude',
          kcal_100g: rec.per100.kcal, protein_100g: rec.per100.p, carbs_100g: rec.per100.c, fat_100g: rec.per100.f, fiber_100g: rec.per100.fib });
        const kw = normFood(parseItem(descs[i]).name);
        if (kw) await db.addPersonalFood({ name: rec.name.slice(0, 80), keywords: [kw], per: '100g', grams: rec.serving_g,
          kcal: rec.per100.kcal, protein_g: rec.per100.p, carbs_g: rec.per100.c, fat_g: rec.per100.f, fiber_g: rec.per100.fib }).catch(() => {});
      }
    }
  }
  let got = 0;
  for (let i = 0; i < rows.length; i++) {
    const e = out[i]; if (!e) continue;
    await db.updateFood(rows[i].id, { label: e.label, grams: round1(e.grams), kcal: e.kcal, protein_g: e.p, carbs_g: e.c, fat_g: e.f, fiber_g: e.fib,
      source: e.by === 'you' ? 'you' : 'claude', cache_key: keys[i] });
    got++;
  }
  return got;
}

/** Pick or take a photo, scaled down so it uploads fast and stays well inside the API's limits. */
export async function pickPhoto(camera: boolean) {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(camera ? 'Camera permission is off for Recomp.' : 'Photo permission is off for Recomp.');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const resize = (a.width ?? 0) >= (a.height ?? 0) ? { width: Math.min(1568, a.width || 1568) } : { height: Math.min(1568, a.height || 1568) };
  const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!m.base64) throw new AiError('image_rejected');
  return { base64: m.base64, mediaType: 'image/jpeg' as const };
}

export async function scanLabel(photo: { base64: string; mediaType: 'image/jpeg' }) {
  return readLabel(await askJson(LABEL_PROMPT, { images: [photo], effort: 'low', maxTokens: 8000, timeoutMs: 90000 }));
}
export async function scanPlate(photo: { base64: string; mediaType: 'image/jpeg' }, cuisine: string | null | undefined) {
  return readPlate(await askJson(platePrompt(cuisine), { images: [photo], effort: 'medium', maxTokens: 8000, timeoutMs: 90000 }));
}

/** r19 logLabelFood: a label is ground truth per 100 g, logged as its own meal and remembered. */
export async function logLabelFood(date: string, name: string, per: Per100, g: number) {
  const m = g / 100;
  await db.addMeal(date, [{ label: name + ' (' + trimNum(g) + ' g — from label)', raw_text: name, grams: g, kcal: round1(per.kcal * m), protein_g: round1(per.p * m),
    carbs_g: round1(per.c * m), fat_g: round1(per.f * m), fiber_g: round1(per.fib * m), source: 'label', cache_key: cacheKeyOf(name) }]);
  const k = cacheKeyOf(name);
  if (k) await db.upsertUserCache({ key: k, name: name.slice(0, 80), serving_g: g, unit_only: false, source: 'label',
    kcal_100g: +per.kcal || 0, protein_100g: +per.p || 0, carbs_100g: +per.c || 0, fat_100g: +per.f || 0, fiber_100g: +per.fib || 0 });
}

/** r19 runReview: the last 7 days, the week before and the one before that, graded by Claude. */
export async function runReview(engine: Engine, D: Days, PROFILE: AiProfile, maxDay: string) {
  const pfl = proteinFloor(PROFILE, engine.G), kfl = kcalFloor(PROFILE);
  const pl = engine.plan(maxDay), cur = D.weekStats(maxDay, pfl), prev = D.weekStats(minus(maxDay, 7), pfl), two = D.weekStats(minus(maxDay, 14), pfl);
  const r = D.rateOfLoss();
  const data = {
    week: cur, weekBefore: prev, twoWeeksBefore: { weightAvg: two.weightAvg, weighIns: two.weighIns },
    targets: { kcal: pl.kcal, protein: pl.protein, proteinFloor: pfl, kcalFloor: kfl, steps: pl.steps, sleepHours: 7 },
    goal: { name: engine.G.name, startKg: engine.T.START_KG, targetKg: engine.T.TARGET_KG, end: engine.G.due, lossPerWeekKg: r && r.perDay < 0 ? r1(-r.perDay * 7) : null },
    phase: pl.inRange ? engine.PL.phases[pl.phase - 1].name : null, weekOfPlan: pl.week,
  };
  const o = await askJson(reviewPrompt(engine.G.type, engine.G.type === 'muscle', kfl, data), { effort: 'medium', maxTokens: 16000, timeoutMs: 150000 });
  const out = normReview(o, cur, pl, engine.G, kfl);
  if (!out) throw new AiError('invalid_json');
  const ch = out.suggestion.change;
  await db.saveReview({ end_date: maxDay, start_date: cur.from, stats: cur, out, change_kcal: ch && 'kcal' in ch ? ch.kcal : null, change_steps: ch && 'steps' in ch ? ch.steps : null });
}

/** r19 applyReviewChange: calories on the goal; steps raise the current and later phases of a saved plan, else the goal. */
export async function applyReviewChange(review: db.ReviewRow, engine: Engine, goalId: string, maxDay: string, savedPlan: boolean) {
  if (review.applied_at) return;
  if (review.change_kcal) await db.updateGoalTargets(goalId, { kcal: review.change_kcal });
  else if (review.change_steps) {
    const pl = engine.plan(maxDay), dl = review.change_steps - pl.steps;
    if (savedPlan) {
      const np = JSON.parse(JSON.stringify(engine.PL));
      np.phases.forEach((ph: { steps: number }, i: number) => { if (i >= pl.phase - 1) ph.steps = Math.max(2000, ph.steps + dl); });
      np.by = 'you'; np.at = Date.now(); np.note = 'Steps raised after a weekly review';
      await db.savePlanVersion({ body: np, source: 'you', note: np.note });
    } else await db.updateGoalTargets(goalId, { steps: (engine.G.steps || 8000) + dl });
  }
  await db.markReviewApplied(review.end_date);
}

/** r19 askPlan + buildProposal: Claude proposes, the app checks, the person decides. */
export async function proposePlan(req: string, engine: Engine, D: Days, PROFILE: AiProfile, maxDay: string): Promise<Proposal> {
  const lw = D.series().filter((x) => x.w != null).pop()?.w ?? null;
  const pfl = proteinFloor(PROFILE, engine.G), P = engine.plan(maxDay), r = D.rateOfLoss();
  const ctx = {
    today: maxDay, weekdayOfDay1: planWeekdays(engine.T.TSTART)[0],
    goal: { name: engine.G.name, start: engine.G.start, end: engine.G.due, startKg: engine.T.START_KG, targetKg: engine.T.TARGET_KG, latestKg: lw,
      lossPerWeekKg: r && r.perDay < 0 ? r1(-r.perDay * 7) : null, kcal: engine.G.kcal, protein: engine.G.protein },
    now: { phase: P.inRange ? P.phase : null, week: P.inRange ? P.week : null, phaseWeeks: engine.T.TPHASE_W },
    lastWeek: D.weekStats(maxDay, pfl), weekBefore: D.weekStats(minus(maxDay, 7), pfl), plan: compactPlan(engine.PL),
  };
  const res = await askJson(planPrompt(req, planRules(engine, PROFILE, lw), ctx), { effort: 'high', maxTokens: 32000, timeoutMs: 240000 });
  const pr = buildProposal(res, req, engine, PROFILE, defaultPlanFor(engine.G, PROFILE, engine.T.TMAINT_W));
  if (!pr) throw new AiError('invalid_json');
  return pr;
}
export const acceptProposal = (pr: Proposal) => db.savePlanVersion({ body: pr.plan, source: 'claude', note: pr.plan.note, kcal: pr.kcal, protein: pr.protein });

/** r19 "Ask Claude again": a fresh estimate for one description, returned for the edit boxes, not saved. */
export async function reEstimate(desc: string, cuisine: string | null | undefined) {
  const recs = readEstimates(await askJson(foodEstimatePrompt([desc], cuisine), { effort: 'low', maxTokens: 4000, timeoutMs: 60000 }), [desc]);
  const rec = recs[0]; if (!rec) return null;
  const po = portionOf(desc, rec);
  return scaleEst(rec, po.g, po.n);
}
