/// <reference types="node" />
// Differential test: runs the r19 web app's own functions (extracted from
// reference/app/recomp.html) and the TypeScript port on the same inputs, and fails on any
// difference.  Run: npm test
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as P from '../src/domain/plan';
import * as F from '../src/domain/food';
import * as O from '../src/domain/onboarding';
import * as TR from '../src/domain/training';
import * as DY from '../src/domain/days';
import * as AI from '../src/domain/ai';
import type { Goal, Profile } from '../src/domain/types';

import { src } from './r19';

const names = ['d', 'key', 'addDays', 'diffDays', 'localKey', 'todayKey', 'trimNum', 'waistWeekday', 'provisionalGoal', 'activeGoal', 'phaseBounds', 'buildProj',
  'applyGoal', 'LIFTS_DEFAULT', 'NAMES_DEFAULT', 'LEGACY_KEYS', 'slotL', 'slotC', 'slotR', 'defaultPlan', 'makePlan', 'homeFirstPlan', 'normPlan', 'applyPlan',
  'plan', 'WHEN_RANK', 'whenRank', 'checkList', 'kcalFloor', 'proteinFloor',
  'normFood', 'foodRe', 'FOODS', 'buildFoodIndex', 'parseItem', 'MODIFIER', 'matchFood', 'fromEntry', 'DISH_RX', 'WITH_RX', 'isDish', 'joinDish', 'splitItems',
  'parseGrams', 'canonName', 'calcTargets', 'setsFor', 'filled', 'setCount', 'BAND_RX', 'BODY_RX', 'loadKind', 'BAND_N', 'defaultBands', 'bandAt', 'bandName', 'bandKg', 'bandLabel', 'topReps', 'stepFor', 'setTxt', 'exDone', 'EXGROUP', 'ALTPOOL', 'ctxOf', 'poolFor', 'resolveLine', 'lastFor', 'repRange', 'woSuggest', 'bestBefore', 'bestToday', 'prText', 'volumeOf', 'lastSameSession', 'fmtDur', 'habitVal', 'habitMet', 'habitStreak', 'dayMet', 'habitLongest', 'habitStrength', 'habitPct', 'habitsHitPct', 'tracksSteps', 'habitById', 'isTimeUnit', 'unitMs', 'normUnit', 'trainedOn', 'dayState', 'streaks', 'itemState', 'calItems', 'dayScore', 'dotState', 'itemValTxt', 'dayActive', 'missStats', 'WALK_MIN', 'series', 'rolling', 'projFor', 'rateOfLoss', 'waistSeries', 'exVolume', 'progExercises', 'exSeries', 'askClaude', 'withTimeout', 'runScan', 'runPlate', 'exParts', 'planWeekdays', 'planRules', 'compactPlan', 'cueFor', 'askPlan', 'buildProposal', 'planDiff', 'avgOf', 'r1', 'weekStats', 'runReview', 'normReview', 'latestWeight', 'portionOf', 'scaleEst', 'needsNumbers', 'shortFoodLabel', 'foodName', 'fqQty'];
const code = names.map(src).join('\n') + `
  var swaps={}, bands=null, TODAY=null, P=null, habits=[], MAXDAY=null;
  var captured=null, sampler={ json:function(p){ captured=p; return new Promise(function(){}); } };
  var scanBusy=false, plateBusy=false, planBusy=false, revBusy=false, planAskText='', planStatus='', revErr='', lastReview=null, proposal=null, currentView='me';
  function $(){ return {innerHTML:'', disabled:false, classList:{add:function(){},remove:function(){}}, scrollIntoView:function(){}, focus:function(){}}; }
  function claudeErr(){ return ''; } function dropFocus(){} function renderPlanAI(){} function renderReview(){} function scheduleShell(){}
  var PROFILE={}, goals=[], G=null, entries={}, PL=null, planSaved=null, LIFTS={}, NAMES={}, PHASES, userChecks=[], hiddenChecks={};
  var START, END, DEPART, TOTAL, WEEKS_N, START_KG, TARGET_KG, PROJ, PHASE_W, MAINT_W, LABS, TASKS, TSTART, TTOTAL, TWEEKS, TPHASE_W, TMAINT_W, FOODS_ALL=[];
  function setup(g, pf, saved, ents){ PROFILE=pf; goals=[g]; entries=ents||{}; planSaved=saved; applyGoal(); buildFoodIndex(); }
`;
const ctx: any = vm.createContext({ console, setTimeout: () => 0, clearTimeout: () => {} });
vm.runInContext(code, ctx);

const goal = (o: Partial<Goal>): Goal => ({ id: 'g1', name: 'x', why: '', type: 'lose', start: '2026-11-03', due: '2027-01-25', event: null, trainStart: null,
  startKg: 82, targetKg: 76, kcal: 1900, protein: 140, steps: 8000, homeFirst: false, done: false,
  milestones: [{ d: '2026-12-01', k: 'lab', t: 'Lipids' }, { d: '2026-12-15', k: 'task', t: 'New shoes' }], ...o });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

test('phaseBounds matches for 1..60 weeks', () => {
  for (let w = 1; w <= 60; w++) assert.deepEqual(P.phaseBounds(w), clone(ctx.phaseBounds(w)), `w=${w}`);
});

const goals: Partial<Goal>[] = [{}, { type: 'recomp' }, { type: 'muscle', kcal: 2700 }, { homeFirst: true }, { trainStart: '2026-11-10' },
  { due: '2026-11-20' }, { due: '2027-06-30', steps: 14500 }, { startKg: null, targetKg: null }, { kcal: 0 as any, protein: 0 as any, steps: 0 as any }];
const profiles: Profile[] = [{}, { equip: 'home', days: 2 }, { equip: 'body', days: 4 }, { equip: 'gym', days: 4 }, { equip: 'gym', days: 5, waistDay: 3 },
  { equip: 'home', days: 5, sex: 'female', waterL: 2.5 }, { days: 9 as any, waistDay: 0 }];

test('default plan, timeline, plan(k) and checkList match across goals x profiles x days', () => {
  let n = 0;
  for (const go of goals) for (const pf of profiles) {
    const g = goal(go);
    const ents = { '2026-11-05': { w: 81.4 } };
    ctx.setup(clone(g), clone(pf), null, ents);
    const firstW = g.startKg ? null : 81.4;
    const e = P.makeEngine(g, pf, null, firstW);
    assert.deepEqual(e.PL, clone(ctx.PL), JSON.stringify({ go, pf }));
    assert.deepEqual(e.T.PROJ, clone(ctx.PROJ));
    assert.equal(e.T.TMAINT_W, ctx.TMAINT_W);
    assert.equal(P.kcalFloor(pf), ctx.kcalFloor());
    assert.equal(P.proteinFloor(pf, g), ctx.proteinFloor());
    const uc = [{ id: 'water', t: 'Drink 3 L', w: 'Morning' }, { id: 'u_1', t: 'Vitamin D', w: 'Breakfast', s: '' }, { id: 'u_2', t: 'Hidden', builtinOnly: true }];
    for (let i = -10; i < 260; i++) {
      const k = new Date(Date.UTC(2026, 10, 3 + i)).toISOString().slice(0, 10);
      const a = e.plan(k), b = clone(ctx.plan(k));
      assert.deepEqual(a, b, `plan ${k} ${JSON.stringify({ go, pf })}`);
      ctx.userChecks = clone(uc); ctx.hiddenChecks = { sleep: 'x' };
      assert.deepEqual(e.checkList(a, uc, { sleep: 'x' }), clone(ctx.checkList(b)).map(({ _i, ...c }: any) => c), `checks ${k}`);
      n++;
    }
  }
  assert.ok(n > 10000);
});

test('normPlan matches on default plans, mangled plans and garbage', () => {
  const base = P.makePlan(goal({}), { equip: 'gym', days: 4 }, 6);
  const cases: unknown[] = [base, null, 7, {}, { programs: {}, phases: [] }, { ...base, phases: base.phases.slice(0, 3) },
    { ...base, by: 'claude', note: 'n'.repeat(300), targets: { carb: 9999, fat: 30.6, fiber: '40' } },
    { ...base, programs: { ...base.programs, 'bad key!': { name: 'Z'.repeat(60), kit: 'body', ex: ['Squat|3x10|cue|more', 'NoScheme|x|y', '|3x5|', 'Row|4 X 8-10'] } } },
    { ...base, phases: base.phases.map((ph, i) => ({ ...ph, steps: i ? 99999 : 'abc', weeks: [ph.weeks[0].map((s, j) => (j === 0 ? { t: 'lift', s: 'nope' } : j === 1 ? { t: 'rest' } : j === 2 ? null : s)), ph.weeks[1], ph.weeks[0]] })) },
    { ...base, phases: base.phases.map((ph) => ({ ...ph, weeks: [ph.weeks[0].slice(0, 6)] })) }];
  for (const c of cases) assert.deepEqual(P.normPlan(clone(c)), clone(ctx.normPlan(clone(c))), JSON.stringify(c)?.slice(0, 80));
});

test('saved plan drives plan(k) the same way', () => {
  const saved = P.normPlan(P.homeFirstPlan(goal({ homeFirst: true }), 6))!;
  saved.phases[2].steps = 12345;
  const g = goal({ trainStart: '2026-11-07' });
  ctx.setup(clone(g), {}, clone(saved), {});
  const e = P.makeEngine(g, {}, saved, null);
  for (let i = 0; i < 100; i++) { const k = new Date(Date.UTC(2026, 10, 3 + i)).toISOString().slice(0, 10); assert.deepEqual(e.plan(k), clone(ctx.plan(k))); }
});

const FOOD_INPUTS = [
  '2 chapati, 1 katori dal, 1 apple', '2 roti and dal', '200 g grilled chicken breast', 'chicken salad', 'boneless chicken biryani', 'chicken tikka with bone',
  'chicken thigh bone-in', '1.5 cups rice. 2 eggs', 'half paneer tikka', '3 idli with sambar', 'banana', 'two boiled eggs', '250 ml milk', '1 l water', '30 g whey protein',
  'oats with milk, banana, 10 g honey', 'chicken salad with lettuce, capsicum, 20 g dressing', 'poke bowl: rice, salmon, edamame', 'masala dosa', 'tea with milk', 'black coffee',
  'mom\'s special curry', 'Paratha (aloo, with butter)', '4 rotis', '100g curd', 'chicken 65', 'large apple', '1 bowl poha', 'peanut butter 2 tbsp', 'greek yogurt 150 g and berries',
  '2 slices bread; 1 tbsp butter', ...'raw cooked uncooked boiled grilled roasted baked steamed air fried airfried pan plain fresh leftover skinless home homemade hot cold warm chopped sliced diced whole light lightly soft dry wet extra for from my some'.split(' ').flatMap((m) => [m + ' paneer', '150 g ' + m + ' chicken breast', m + ' dal', '2 ' + m + ' eggs']), 'curry paneer xyz', 'grilled fish 180g', 'sandwich with egg, cheese', 'brown rice 1 cup', 'one samosa', 'dal makhani 1 katori', 'kg', '', '   ', 'andand and',
];

test('food parsing, matching and scaling match on a phrase corpus', () => {
  ctx.setup(clone(goal({})), { myFoods: [{ n: 'Mom curry', k: ['special curry'], per: '100g', g: 200, v: [150, 8, 10, 7, 2] }] }, null, {});
  const idx = F.buildFoodIndex([{ n: 'Mom curry', k: ['special curry'], per: '100g', g: 200, v: [150, 8, 10, 7, 2] }]);
  for (const raw of FOOD_INPUTS) {
    assert.deepEqual(F.splitItems(raw), clone(ctx.splitItems(raw)), 'split ' + raw);
    const parts = F.splitFoodInput(raw);
    const webParts: string[] = []; raw.split(/\n+/).forEach((l) => { if (l.trim()) webParts.push(...ctx.joinDish(ctx.splitItems(l))); });
    assert.deepEqual(parts, clone(webParts), 'parts ' + raw);
    assert.equal(F.isDish(raw), ctx.isDish(raw));
    assert.equal(F.canonName(raw), ctx.canonName(raw), 'canon ' + raw);
    assert.equal(F.parseGrams(raw), ctx.parseGrams(raw));
    for (const p of parts.concat([raw]).filter((s) => s.trim())) {
      const it = F.parseItem(p); assert.deepEqual(it, clone(ctx.parseItem(p)), 'item ' + p);
      const a = F.matchFood(it.name, idx), b = ctx.matchFood(it.name);
      assert.equal(a?.n ?? null, b?.n ?? null, 'match ' + p);
      if (a) { const { grams, ...row } = F.fromEntry(it, a); assert.deepEqual(row, clone(ctx.fromEntry(it, b))); }
      const rec = { name: 'X', serving_g: 120, per100: { kcal: 155, p: 13, c: 1.1, f: 11, fib: 0 }, unitOnly: p.length % 2 === 0 };
      const po = F.portionOf(p, rec); assert.deepEqual(po, clone(ctx.portionOf(p, rec)), 'portion ' + p);
      assert.deepEqual(F.scaleEst(rec, po.g, po.n), clone(ctx.scaleEst(rec, po.g, po.n)));
    }
  }
});

test('every built-in food matches itself by each keyword', () => {
  ctx.setup(clone(goal({})), {}, null, {});
  for (const f of F.FOODS) for (const k of f.k) assert.equal(F.matchFood(k)?.n ?? null, ctx.matchFood(k)?.n ?? null, k);
});

test('label helpers match', () => {
  const labels = ['Dal rice (150 g — rice, toor dal, ghee)', 'Eggs (2 × 50 g)', 'Rice (150 g · assumed serving)', 'Plate (120 g, from photo)', 'Plain', 'A (b) (c — d)'];
  for (const l of labels) {
    assert.equal(F.shortFoodLabel(l), ctx.shortFoodLabel(l));
    assert.equal(F.foodName(l), ctx.foodName(l));
    assert.equal(F.fqQty(l), ctx.fqQty(l));
  }
  for (const r of [{ src: 'none', kcal: 1, p: 1 }, { src: 'claude', kcal: 0, p: 0 }, { src: 'claude', kcal: 5, p: 0 }, { src: undefined, kcal: 0, p: 0 }, { src: 'table', kcal: 0, p: 0 }] as any[])
    assert.equal(F.needsNumbers(r), ctx.needsNumbers(r));
});

test('calcTargets matches across sexes, goals, sizes, steps and days', () => {
  let n = 0;
  for (const sex of ['female', 'male', '']) for (const type of ['lose', 'recomp', 'muscle', 'health'])
    for (const [weight, height, age] of [[30, 120, 13], [52, 155, 24], [82, 178, 31], [118, 190, 58], [350, 230, 100], ['', '', '']])
      for (const steps of [3000, 5000, 8000, 11000, undefined]) for (const days of [2, 3, 5, undefined]) for (const weeks of [8, 12, 24, undefined]) {
        const a = { sex, type, weight, height, age, steps, days, weeks } as any;
        assert.deepEqual(O.calcTargets(a), clone(ctx.calcTargets(clone(a))), JSON.stringify(a));
        n++;
      }
  assert.ok(n > 5000);
});

// Deterministic pseudo-random so failures reproduce.
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

test('training rules match r19 on random set histories', () => {
  const rand = rng(42);
  let checks = 0;
  for (const [equip, days, homeFirst] of [['gym', 4, false], ['gym', 3, false], ['home', 3, false], ['body', 2, false], ['gym', 3, true]] as const) {
    const g = goal({ homeFirst, start: '2026-09-01', due: '2026-12-20', trainStart: '2026-09-01' });
    const pf: Profile = { equip, days };
    ctx.setup(clone(g), clone(pf), null, {});
    const e = P.makeEngine(g, pf, null, null);
    const bands = rand() < 0.5 ? null : [{ n: 'Yellow', kg: 5 }, { n: 'Red', kg: 9 }, { n: 'Green', kg: null }, { n: 'Blue', kg: 16 }, { n: 'Black', kg: 23 }];
    // swaps: pick an alternate for some exercises that have a pool
    const swaps: Record<string, string> = {};
    for (const [key2, prog] of Object.entries(e.PL.programs)) for (const line of prog.ex) {
      const pool = TR.poolFor(e.PL, key2, line.split('|')[0]);
      if (pool.length && rand() < 0.4) swaps[key2 + '|' + line.split('|')[0]] = pool[Math.floor(rand() * pool.length)].split('|')[0];
    }
    if (rand() < 0.3) swaps['fullA|Not a real exercise'] = 'Whatever';
    // random history over the goal
    const entries: TR.SetHistory = {};
    for (let i = 0; i < 110; i++) {
      const k = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
      const p = e.plan(k);
      if (p.type !== 'lift' || rand() < 0.25) continue;
      const day: Record<string, TR.Set_[]> = {};
      TR.sessionList(e.PL, swaps, p.session).forEach((R) => {
        if (rand() < 0.15) return;
        const kind = TR.loadKind(R.name), n = TR.setCount(R.sch) + (rand() < 0.2 ? 1 : 0), hi = TR.repRange(R.sch).hi;
        const arr: TR.Set_[] = [];
        for (let j = 0; j < n; j++) {
          if (rand() < 0.08) { arr.push({}); continue; }
          const x: TR.Set_ = { r: rand() < 0.1 ? undefined : Math.max(1, hi - Math.floor(rand() * 3)) };
          if (kind === 'weight' && rand() < 0.9) x.w = 10 + Math.floor(rand() * 12) * 2.5;
          if (kind === 'band') x.b = 1 + Math.floor(rand() * 5);
          if (x.r === undefined) delete x.r;
          arr.push(x);
        }
        while (arr.length && !TR.filled([arr[arr.length - 1]]).length) arr.pop();
        if (arr.length) day[R.name] = arr;
      });
      entries[k] = day;
    }
    const webEntries: any = {};
    Object.entries(entries).forEach(([k, v]) => { webEntries[k] = { sets: clone(v) }; });
    ctx.entries = webEntries; ctx.swaps = clone(swaps); ctx.bands = clone(bands);
    for (const TODAY of ['2026-09-01', '2026-09-20', '2026-10-15', '2026-11-30', '2026-12-20']) {
      const p = e.plan(TODAY);
      ctx.TODAY = TODAY; ctx.P = ctx.plan(TODAY);
      for (const [key2, prog] of Object.entries(e.PL.programs)) for (const line of prog.ex) {
        const R = TR.resolveLine(e.PL, swaps, key2, line);
        assert.deepEqual(R, clone(ctx.resolveLine(key2, line)), 'resolve ' + line);
        const nm = R.name, sch = R.sch, kind = TR.loadKind(nm);
        assert.equal(kind, ctx.loadKind(nm)); assert.equal(TR.stepFor(nm), ctx.stepFor(nm));
        assert.equal(TR.topReps(sch), ctx.topReps(sch)); assert.deepEqual(TR.repRange(sch), clone(ctx.repRange(sch))); assert.equal(TR.setCount(sch), ctx.setCount(sch));
        const lp = TR.lastFor(nm, entries, e.T.START, e.T.TOTAL, TODAY);
        assert.deepEqual(lp, clone(ctx.lastFor(nm)), 'last ' + nm);
        assert.deepEqual(TR.woSuggest(nm, sch, kind, lp, p.phase, bands), clone(ctx.woSuggest(nm, sch, kind, ctx.lastFor(nm))), 'suggest ' + nm);
        assert.equal(TR.bestBefore(nm, kind, entries, TODAY), ctx.bestBefore(nm, kind));
        assert.equal(TR.bestToday(nm, kind, entries[TODAY]?.[nm] ?? []), ctx.bestToday(nm, kind));
        assert.equal(TR.exDone(entries[TODAY]?.[nm] ?? [], sch), ctx.exDone(nm, sch));
        for (const x of (entries[TODAY]?.[nm] ?? []).concat(lp?.sets ?? [])) assert.equal(TR.setTxt(x, TR.isTimed(sch), bands), ctx.setTxt(x, TR.isTimed(sch)));
        const b = TR.bestBefore(nm, kind, entries, TODAY);
        if (b != null) assert.equal(TR.prText(nm, kind, b, bands), ctx.prText(nm, kind, b));
        checks++;
      }
      for (let i = 0; i < 110; i += 3) {
        const k = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
        assert.deepEqual(TR.volumeOf(e.plan(k), e.PL, swaps, entries[k], bands), clone(ctx.volumeOf(k)), 'volume ' + k);
      }
      if (p.session) assert.deepEqual(TR.lastSameSession(e.plan, p.session, e.PL, swaps, entries, e.T.START, e.T.TOTAL, TODAY, bands), clone(ctx.lastSameSession()), 'lastSame ' + TODAY);
    }
    for (let i = 0; i <= 5; i++) assert.equal(TR.bandLabel(bands, i), ctx.bandLabel(i));
  }
  for (const ms of [0, 999, 59000, 61000, 3599000, 3600000, 7322000]) assert.equal(TR.fmtDur(ms), ctx.fmtDur(ms));
  assert.ok(checks > 500, String(checks));
});

test('habits, consistency and weight stats match r19 on random histories', () => {
  const rand = rng(7);
  const habitsDef: DY.HabitDef[] = [
    { id: 'walk', name: 'Walk', type: 'build', unit: 'min', goal: 20, step: 5 },
    { id: 'gaming', name: 'Gaming / media', type: 'limit', unit: 'h', goal: 2, step: 0.5 },
    { id: 'h1', name: 'Read', type: 'build', unit: 'pages', goal: 10, step: 5 },
    { id: 'h2', name: 'No sugar', type: 'limit', unit: 'times', goal: 0, step: 1 },
    { id: 'h3', name: 'Morning steps', type: 'build', unit: 'steps', goal: 8000, step: 500 },
  ];
  let checks = 0;
  for (const [type, trainStart] of [['lose', null], ['muscle', '2026-09-08'], ['recomp', null]] as const) {
    const g = goal({ type, start: '2026-09-01', due: '2026-11-23', trainStart, startKg: rand() < 0.5 ? 82 : null, targetKg: type === 'muscle' ? 86 : 76 });
    const pf: Profile = { equip: 'gym', days: 3 };
    const entries: DY.Entries = {};
    let w = 82;
    for (let i = 0; i < 84; i++) {
      const k = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
      if (rand() < 0.18) continue;                       // no entry at all
      const e: DY.DayEntry = {};
      w += (rand() - 0.6) * 0.4;
      // weigh-ins dense in some stretches and sparse in others, so the 7-day average and the
      // 28-day trend hit their minimum-count limits
      if (rand() < (type === 'recomp' ? 0.12 : i % 30 < 15 ? 0.85 : 0.15)) e.w = Math.round(w * 10) / 10;
      if (rand() < 0.6) e.steps = rand() < 0.3 ? [1999, 2000, 2001, 0][Math.floor(rand() * 4)] : Math.floor(rand() * 12000);
      if (rand() < 0.3) e.waist = 90 - i * 0.05;
      if (rand() < 0.5) { e.food = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => ({})); e.kcal = 1500 + Math.floor(rand() * 800); e.protein = 80 + Math.floor(rand() * 60); }
      if (rand() < 0.35) e.sets = { 'Leg press': [{ w: 60, r: 10 }, { w: 60, r: rand() < 0.2 ? null : 9 }], 'Lat pulldown': rand() < 0.3 ? [{ b: 2, r: 12 }] : [] };
      if (rand() < 0.5) { e.habits = {}; habitsDef.forEach((h) => { if (rand() < 0.6) e.habits![h.id] = Math.round(rand() * h.goal * 2 * 2) / 2; }); }
      if (rand() < 0.2) e.checks = { train: rand() < 0.7, water: true };
      if (rand() < 0.05) Object.keys(e).forEach((f) => delete (e as any)[f]);   // an empty {} day
      entries[k] = e;
    }
    for (const MAXDAY of ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-29', '2026-10-06', '2026-10-20', '2026-11-03', '2026-11-23']) {
      const firstW = Object.keys(entries).filter((k) => k >= g.start && entries[k].w != null).sort().map((k) => entries[k].w!)[0] ?? null;
      const engine = P.makeEngine(g, pf, null, firstW);
      ctx.setup(clone(g), clone(pf), null, clone(entries));
      ctx.habits = clone(habitsDef); ctx.MAXDAY = MAXDAY; ctx.bands = null;
      const D = DY.makeDays({ entries, engine, MAXDAY, habits: habitsDef, bands: null });
      for (const h of habitsDef) {
        assert.equal(D.habitStreak(h), ctx.habitStreak(h), 'streak ' + h.id);
        assert.equal(D.habitLongest(h), ctx.habitLongest(h), 'longest ' + h.id);
        assert.equal(D.habitStrength(h), ctx.habitStrength(h), 'strength ' + h.id);
        assert.equal(D.habitPct(h), ctx.habitPct(h), 'pct ' + h.id);
        assert.equal(DY.tracksSteps(h), ctx.tracksSteps(h));
      }
      assert.equal(D.habitsHitPct(), ctx.habitsHitPct());
      assert.deepEqual(D.streaks(), clone(ctx.streaks()), 'streaks ' + MAXDAY);
      assert.deepEqual(D.missStats(), clone(ctx.missStats()), 'miss ' + MAXDAY);
      for (let i = -3; i < 88; i++) {
        const k = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
        assert.equal(D.dayState(k), ctx.dayState(k), 'dayState ' + k);
        assert.equal(D.dotState(k), ctx.dotState(k), 'dot ' + k);
        assert.deepEqual(D.dayScore(k), clone(ctx.dayScore(k)), 'score ' + k);
        assert.equal(D.dayActive(k), ctx.dayActive(k));
        for (const it of D.calItems()) {
          assert.equal(D.itemState(it.id, k), ctx.itemState(it.id, k), `item ${it.id} ${k}`);
          assert.equal(D.itemValTxt(it.id, k), ctx.itemValTxt(it.id, k).replace(/\u00b7/g, '\u00b7'), `itemVal ${it.id} ${k}`);
        }
        checks++;
      }
      const sr = D.series();
      assert.deepEqual(sr, clone(ctx.series()));
      for (let i = 0; i < sr.length; i += 5) { assert.equal(D.rolling(sr, i), ctx.rolling(ctx.series(), i)); assert.ok(Math.abs(D.projFor(i) - ctx.projFor(i)) < 1e-9); }
      assert.deepEqual(D.rateOfLoss(), clone(ctx.rateOfLoss()), 'rate ' + MAXDAY);
      assert.deepEqual(D.waistSeries(), clone(ctx.waistSeries()));
      assert.deepEqual(D.progExercises(), clone(ctx.progExercises()));
      assert.deepEqual(D.exSeries('Leg press'), clone(ctx.exSeries('Leg press')));
    }
  }
  for (const u of ['H', 'hrs', 'Minutes', 'mins', 'pages', '']) { assert.equal(DY.normUnit(u), ctx.normUnit(u)); assert.equal(DY.isTimeUnit(u), ctx.isTimeUnit(u)); assert.equal(DY.unitMs(u), ctx.unitMs(u)); }
  assert.ok(checks > 1000, String(checks));
});

test('rate of loss and rolling average at their minimum-count limits', () => {
  const g = goal({ start: '2026-09-01', due: '2026-11-23', startKg: 80, targetKg: 75 });
  const engine = P.makeEngine(g, {}, null, null);
  const MAXDAY = '2026-10-15';
  for (const days of [[0], [0, 3], [0, 5, 10], [0, 4, 9], [0, 3, 6, 10], [0, 2, 4, 6], [0, 9, 18, 27, 28], [20, 27]]) {
    const entries: DY.Entries = {};
    days.forEach((n, i) => { entries[new Date(Date.UTC(2026, 9, 15 - 27 + n)).toISOString().slice(0, 10)] = { w: 80 - i * 0.4 }; });
    ctx.setup(clone(g), {}, null, clone(entries)); ctx.MAXDAY = MAXDAY; ctx.habits = [];
    const D = DY.makeDays({ entries, engine, MAXDAY, habits: [] });
    assert.deepEqual(D.rateOfLoss(), clone(ctx.rateOfLoss()), JSON.stringify(days));
    const sr = D.series();
    for (let i = 0; i < sr.length; i++) assert.equal(D.rolling(sr, i), ctx.rolling(ctx.series(), i));
  }
});

test('Claude prompts are word for word r19, and their checks agree', () => {
  const g = goal({ start: '2026-09-01', due: '2026-11-23', trainStart: '2026-09-01', type: 'lose', startKg: 84, targetKg: 78 });
  for (const [pf, MAXDAY] of [[{ equip: 'gym', days: 3, sex: 'female', heightCm: 162, age: 30, jointFriendly: true, rules: 'No overhead pressing\n\n  Bad left knee  ', cuisine: 'South Indian', waterL: 2.5 }, '2026-10-20'],
      [{ equip: 'home', days: 4, sex: 'male' }, '2026-09-04'], [{ equip: 'gym', days: 4 }, '2026-11-23']] as [any, string][]) {
    const entries: DY.Entries = {};
    const rand = rng(3);
    for (let i = 0; i < 84; i++) {
      const k = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
      if (rand() < 0.2) continue;
      entries[k] = { w: 84 - i * 0.06, steps: Math.floor(rand() * 11000), kcal: rand() < 0.7 ? 1500 + Math.floor(rand() * 700) : undefined, protein: 90 + Math.floor(rand() * 50), sleep: 6 + rand() * 2,
        sets: rand() < 0.4 ? { 'Lat pulldown': [{ w: 30 + i * 0.1, r: 10 }, { w: 30, r: 9 }], 'Leg press': [{ w: 80, r: 12 }] } : undefined,
        habits: { walk: rand() < 0.5 ? 25 : 5, gaming: rand() * 3 }, checks: rand() < 0.3 ? { train: true, water: true } : undefined };
      Object.keys(entries[k]).forEach((f) => (entries[k] as any)[f] === undefined && delete (entries[k] as any)[f]);
    }
    const habitsDef: DY.HabitDef[] = [{ id: 'walk', name: 'Walk', type: 'build', unit: 'min', goal: 20, step: 5 }, { id: 'gaming', name: 'Gaming / media', type: 'limit', unit: 'h', goal: 2, step: 0.5 }];
    const engine = P.makeEngine(g, pf, null, null);
    ctx.setup(clone(g), clone(pf), null, clone(entries)); ctx.habits = clone(habitsDef); ctx.MAXDAY = MAXDAY; ctx.TODAY = MAXDAY; ctx.P = ctx.plan(MAXDAY); ctx.bands = null;
    const D = DY.makeDays({ entries, engine, MAXDAY, habits: habitsDef });
    const pfl = P.proteinFloor(pf, g);
    for (const k of [MAXDAY, AI.minus(MAXDAY, 7), AI.minus(MAXDAY, 14)]) assert.deepEqual(D.weekStats(k, pfl), clone(ctx.weekStats(k)), 'weekStats ' + k);
    // food estimate
    const list = ['moms special curry', 'chicken salad with lettuce, capsicum, 20 g dressing', '2 "paneer" rolls'];
    ctx.askClaude(list); assert.equal(AI.foodEstimatePrompt(list, pf.cuisine), ctx.captured);
    // label and plate
    ctx.runScan({}); assert.equal(AI.LABEL_PROMPT, ctx.captured);
    ctx.plateBusy = false; ctx.runPlate({}); assert.equal(AI.platePrompt(pf.cuisine), ctx.captured);
    // plan builder
    const lw = D.series().filter((x) => x.w != null).pop()?.w ?? null;
    assert.deepEqual(AI.planRules(engine, pf, lw), clone(ctx.planRules()));
    const req = 'My "left" knee hurts on split squats. I can only train 3 days a week.';
    ctx.planAskText = req; ctx.planBusy = false; ctx.askPlan();
    const r = D.rateOfLoss();
    const pctx = { today: MAXDAY, weekdayOfDay1: AI.planWeekdays(engine.T.TSTART)[0],
      goal: { name: g.name, start: g.start, end: g.due, startKg: engine.T.START_KG, targetKg: engine.T.TARGET_KG, latestKg: lw, lossPerWeekKg: r && r.perDay < 0 ? AI.r1(-r.perDay * 7) : null, kcal: g.kcal, protein: g.protein },
      now: { phase: engine.plan(MAXDAY).inRange ? engine.plan(MAXDAY).phase : null, week: engine.plan(MAXDAY).inRange ? engine.plan(MAXDAY).week : null, phaseWeeks: engine.T.TPHASE_W },
      lastWeek: D.weekStats(MAXDAY, pfl), weekBefore: D.weekStats(AI.minus(MAXDAY, 7), pfl), plan: AI.compactPlan(engine.PL) };
    assert.equal(AI.planPrompt(req, AI.planRules(engine, pf, lw), pctx), ctx.captured, 'plan prompt');
    // weekly review
    ctx.revBusy = false; ctx.runReview();
    const pl = engine.plan(MAXDAY), cur = D.weekStats(MAXDAY, pfl), two = D.weekStats(AI.minus(MAXDAY, 14), pfl);
    const data = { week: cur, weekBefore: D.weekStats(AI.minus(MAXDAY, 7), pfl), twoWeeksBefore: { weightAvg: two.weightAvg, weighIns: two.weighIns },
      targets: { kcal: pl.kcal, protein: pl.protein, proteinFloor: pfl, kcalFloor: P.kcalFloor(pf), steps: pl.steps, sleepHours: 7 },
      goal: { name: g.name, startKg: engine.T.START_KG, targetKg: engine.T.TARGET_KG, end: g.due, lossPerWeekKg: r && r.perDay < 0 ? AI.r1(-r.perDay * 7) : null },
      phase: pl.inRange ? engine.PL.phases[pl.phase - 1].name : null, weekOfPlan: pl.week };
    assert.equal(AI.reviewPrompt(g.type, g.type === 'muscle', P.kcalFloor(pf), data), ctx.captured, 'review prompt');
    // review validation, including out-of-bounds suggestions
    for (const o of [null, {}, { headline: 'x', grade: ' b+ ', truths: ['a', 'b', 'c', 'd', 'e', 'f'], wins: ['1', '2', '3'], suggestion: { what: 'w', change: { kcal: g.kcal - 150 } } },
        { headline: 'y', suggestion: { change: { kcal: 900 } } }, { headline: 'k1', suggestion: { change: { kcal: g.kcal - 250 } } }, { headline: 'k2', suggestion: { change: { kcal: g.kcal - 280 } } }, { headline: 'k3', suggestion: { change: { kcal: g.kcal } } }, { headline: 'z', suggestion: { change: { steps: pl.steps + 1449 } } }, { headline: 'q', grade: 'Z', suggestion: { change: { steps: pl.steps + 9000 } } }]) {
      assert.deepEqual(AI.normReview(clone(o), cur, pl, g, P.kcalFloor(pf)), clone(ctx.normReview(clone(o), cur, ctx.plan(MAXDAY))), JSON.stringify(o));
    }
    // proposals: a realistic edit, a dangerous one (below the floors), and junk
    const edited = clone(AI.compactPlan(engine.PL)) as any;
    const k0 = Object.keys(edited.programs)[0];
    edited.programs[k0].ex[0] = 'Box squat|3 × 8';
    edited.programs[k0].ex.push('Brand new move|2 x 12|Keep it slow');
    edited.phases[1].steps = 11000; edited.phases[0].weeks[0][1] = { t: 'rest', c: '' }; edited.targets.fat = 70;
    for (const res of [{ summary: 's', changes: ['a'], goal: { kcal: 1700, protein: 140 }, plan: edited }, { goal: { kcal: 500, protein: 20 }, plan: clone(edited) }, { goal: { kcal: 4500, protein: 320 }, plan: clone(edited), changes: Array.from({ length: 8 }, (_, i) => 'c' + i) }, { goal: { kcal: 4800, protein: 330 }, plan: clone(edited) }, { plan: { phases: [] } }, null]) {
      const mine = AI.buildProposal(clone(res), req, engine, pf, P.makePlan(g, pf, engine.T.TMAINT_W), 1);
      const theirs = clone(ctx.buildProposal(clone(res), req));
      if (theirs && theirs.plan) theirs.plan.at = 1;
      assert.deepEqual(mine, theirs, JSON.stringify(res)?.slice(0, 60));
    }
    for (const nm of ['Box squat', 'Goblet squat to box', 'Band pull-apart', 'Nope']) assert.equal(AI.cueFor(nm, engine.PL, P.makePlan(g, pf, engine.T.TMAINT_W)), ctx.cueFor(nm));
  }
});
