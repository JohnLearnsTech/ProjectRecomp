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
import type { Goal, Profile } from '../src/domain/types';

const html = readFileSync(new URL('../../reference/app/recomp.html', import.meta.url), 'utf8');

/** Source of `function name(...){...}` or `var name = ...;` by brace matching. */
function src(name: string): string {
  let at = html.search(new RegExp(`\\n\\s*function ${name}\\(`));
  let isVar = false;
  if (at < 0) { at = html.search(new RegExp(`\\n\\s*var ${name}\\s*=`)); isVar = true; }
  if (at < 0) throw new Error('missing ' + name);
  at = html.indexOf(isVar ? 'var' : 'function', at);
  if (isVar && !/[[{]/.test(html.slice(html.indexOf('=', at) + 1).trimStart()[0])) return html.slice(at, html.indexOf(';\n', at) + 1);
  let i = html.indexOf(isVar ? (html.slice(html.indexOf('=', at) + 1).trimStart()[0]) : '{', isVar ? html.indexOf('=', at) : at);
  let depth = 0, str: string | null = null, re = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (str) { if (c === '\\') i++; else if (c === str) str = null; continue; }
    if (re) { if (c === '\\') i++; else if (c === '/') re = false; continue; }
    if (c === '"' || c === "'") str = c;
    else if (c === '/' && html[i + 1] === '/') i = html.indexOf('\n', i);
    else if (c === '/' && /[(,=:!&|?{};]\s*$/.test(html.slice(Math.max(0, i - 3), i))) re = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) break;
  }
  return html.slice(at, i + 1) + (isVar ? ';' : '');
}

const names = ['d', 'key', 'addDays', 'diffDays', 'localKey', 'todayKey', 'trimNum', 'waistWeekday', 'provisionalGoal', 'activeGoal', 'phaseBounds', 'buildProj',
  'applyGoal', 'LIFTS_DEFAULT', 'NAMES_DEFAULT', 'LEGACY_KEYS', 'slotL', 'slotC', 'slotR', 'defaultPlan', 'makePlan', 'homeFirstPlan', 'normPlan', 'applyPlan',
  'plan', 'WHEN_RANK', 'whenRank', 'checkList', 'kcalFloor', 'proteinFloor',
  'normFood', 'foodRe', 'FOODS', 'buildFoodIndex', 'parseItem', 'MODIFIER', 'matchFood', 'fromEntry', 'DISH_RX', 'WITH_RX', 'isDish', 'joinDish', 'splitItems',
  'parseGrams', 'canonName', 'calcTargets', 'setsFor', 'filled', 'setCount', 'BAND_RX', 'BODY_RX', 'loadKind', 'BAND_N', 'defaultBands', 'bandAt', 'bandName', 'bandKg', 'bandLabel', 'topReps', 'stepFor', 'setTxt', 'exDone', 'EXGROUP', 'ALTPOOL', 'ctxOf', 'poolFor', 'resolveLine', 'lastFor', 'repRange', 'woSuggest', 'bestBefore', 'bestToday', 'prText', 'volumeOf', 'lastSameSession', 'fmtDur', 'portionOf', 'scaleEst', 'needsNumbers', 'shortFoodLabel', 'foodName', 'fqQty'];
const code = names.map(src).join('\n') + `
  var swaps={}, bands=null, TODAY=null, P=null;
  var PROFILE={}, goals=[], G=null, entries={}, PL=null, planSaved=null, LIFTS={}, NAMES={}, PHASES, userChecks=[], hiddenChecks={};
  var START, END, DEPART, TOTAL, WEEKS_N, START_KG, TARGET_KG, PROJ, PHASE_W, MAINT_W, LABS, TASKS, TSTART, TTOTAL, TWEEKS, TPHASE_W, TMAINT_W, FOODS_ALL=[];
  function setup(g, pf, saved, ents){ PROFILE=pf; goals=[g]; entries=ents||{}; planSaved=saved; applyGoal(); buildFoodIndex(); }
`;
const ctx: any = vm.createContext({ console });
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
