/// <reference types="node" />
// r19 backup import: the normalizers match r19's own, and a backup built from the reference
// examples converts to rows that satisfy the database constraints.  Run: npm test
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as B from '../src/domain/backup';
import { src } from './r19';

const ex = (n: string) => JSON.parse(readFileSync(new URL(`../../reference/schemas/examples/${n}.example.json`, import.meta.url), 'utf8'));
const r19 = vm.createContext({});
vm.runInContext(['dbDec', 'BAND_N', 'normBands', 'normUnit', 'normHabits'].map(src).join('\n'), r19);
const clone = (x: unknown) => JSON.parse(JSON.stringify(x));

test('dbDec, normBands, normHabits match r19', () => {
  const enc = { a: { __arr: [1, { __arr: [2] }] }, b: { __arr: 3 }, c: [{ __arr: [] }], d: { x: { __arr: ['y'] } } };
  assert.deepEqual(B.dbDec(enc), clone(r19.dbDec(enc)));
  for (const v of [null, [], ['A', '', 'C', 'D', 'E'], [{ n: 'Red', kg: '5' }, { kg: '' }, 7, null, { n: 'X', kg: 0 }], [1, 2, 3, 4], 'x'])
    assert.deepEqual(B.normBands(v), clone(r19.normBands(v)));
  const hs = [[{ id: 'a', name: 'Read', unit: 'Pages', goal: '10', step: 0 }, { id: 'b' }, null, { id: 'c', name: 'x'.repeat(50), type: 'limit', unit: 'Hours', goal: 'z', step: 2 }], [], [{ name: 'no id' }], 'x'];
  for (const h of hs) assert.deepEqual(B.normHabits(h), clone(r19.normHabits(h)));
});

test('grams from the label', () => {
  assert.equal(B.gramsFromLabel('Egg, whole, boiled (2 × 43 g)'), 86);
  assert.equal(B.gramsFromLabel('Oats, dry (40 g)'), 40);
  assert.equal(B.gramsFromLabel('Demo protein bar (60 g — from label)'), 60);
  assert.equal(B.gramsFromLabel('Mystery stew'), null);
  assert.equal(B.gramsFromLabel('Rice (1 bowl)'), null);
});

const backup = () => {
  const day = ex('day-log'), goal = ex('goal');
  return {
    app: 'recomp', version: 1, goals: [{ ...goal, id: 'old', done: true, name: 'Spring' }, { id: 'p', provisional: true, start: '2026-01-01', due: '2026-02-01' }, goal],
    plan: ex('plan'), planPrev: { plan: null, kcal: 2200, protein: 140 }, habits: [ex('habit'), { id: 'walk', name: 'Walk', type: 'build', unit: 'minutes', goal: 10, step: 5 }],
    keystone: 'walk', userChecks: [{ id: 'u_m3a1b2c417', t: 'Vitamin D', w: 'morning', s: '' }, { id: 'water', t: 'Water 3 L', w: 'anytime', s: '' }],
    hiddenChecks: { photos: true, lab: 'Blood test' }, bands: ['Light', 'Medium', 'Heavy', '', 'XL'], swaps: { 'fullA|Leg press': 'Goblet squat', 'bad key|x': 'y', nobar: 'z' },
    savedMeals: [ex('saved-meal')], estCache: { 'v2:grilled halloumi wrap': ex('food-cache-entry'), 'v2:': { per100: { kcal: 1 } }, 'v2:nope': { name: 'x' } },
    reminders: ex('reminders'), profile: { ...ex('profile'), sex: '', waistDay: '9' },
    reviews: [ex('review'), { ...ex('review'), at: 1, out: { headline: 'older duplicate' } }],
    entries: {
      '2026-10-12': day,
      '2026-10-13': { w: '', steps: '7000', sleep: 'x', kcal: 1800, protein: 120, sets: { 'Leg press': { w: 82.5, r: 10 }, Bad: 'x' }, habits: { gone: 2, walk: '' }, hlog: { walk: [{ s: 5, e: 5 }] } },
      '2026-10-14': { food: [{ label: 'Tea', kcal: 0, p: 0 }, { label: 'Toast (2 × 30 g)', kcal: 160, p: 5, src: 'weird' }, { label: 'Dal', src: 'pending', kcal: 0, p: 0 }] },
      '2026-02-30': { w: 80 }, notadate: { w: 80 }, '2026-10-15': 'x',
    },
  };
};

test('converts a backup built from the reference examples', () => {
  const { payload: P, summary: S, notes } = B.parseBackup(backup());
  // goals: provisional dropped, the last not-done goal is active, the done one stays done
  assert.deepEqual(P.goals.map((g: any) => [g.id, g.status]), [['old', 'done'], ['gm3a0k0', 'active']]);
  assert.equal(P.goal_milestones.length, 4);
  assert.equal(P.goals[1].train_start_date, '2026-09-01');
  // plan: planPrev without a plan -> one version, with the old targets kept for restore
  assert.deepEqual(P.plans.map((p: any) => [p.version, p.is_current, p.prev_version, p.prev_kcal, p.prev_protein, p.source]), [[1, true, null, 2200, 140, 'you']]);
  // profile
  assert.equal(P.profile.sex, 'unspecified'); assert.equal(P.profile.waist_weekday, 2); assert.equal(P.profile.keystone_habit_id, 'walk');
  assert.equal(P.profile.bands[3].n, 'Band 4'); assert.ok(P.profile.setup_at);
  assert.equal(P.personal_foods[0].kcal, 380); assert.equal(P.weight_history.length, 2); assert.equal(P.profile_notes[0].title, 'Why 2,100 kcal');
  // days: invalid keys and non-objects skipped
  assert.deepEqual(P.day_logs.map((d: any) => d.date), ['2026-10-12', '2026-10-13', '2026-10-14']);
  const d13 = P.day_logs[1];
  assert.deepEqual([d13.weight_kg, d13.steps, d13.sleep_h, d13.kcal_total, d13.protein_total_g], [null, 7000, null, 1800, 120]);
  assert.equal(P.day_logs[0].kcal_total, null, 'days with food rows get their totals from the rows');
  // food
  const f12 = P.food_entries.filter((r: any) => r.date === '2026-10-12');
  assert.equal(f12.length, 7); assert.equal(f12[0].grams, 86); assert.equal(f12[0].meal_no, 1); assert.equal(f12[0].cache_key, 'v2:eggs');
  const f14 = P.food_entries.filter((r: any) => r.date === '2026-10-14').map((r: any) => r.source);
  assert.deepEqual(f14, ['none', 'you', 'none']);
  assert.equal(S.kcalSum, 1607 - 1607 + Math.round(134 + 152 + 560 + 118 + 230 + 412.5) + 1800 + 160);
  // sets: legacy single set, timed holds from the plan, swap alternates inherit the scheme
  const lp = P.set_entries.filter((s: any) => s.exercise_name === 'Leg press');
  assert.equal(lp.length, 4); assert.equal(lp[3].weight_kg, 82.5); assert.equal(lp[3].set_no, 1);
  assert.ok(P.set_entries.filter((s: any) => /plank/.test(s.exercise_name)).every((s: any) => s.is_timed));
  assert.ok(lp.every((s: any) => !s.is_timed));
  // habits: kept, deleted habit kept archived, empty value and zero-length segment skipped
  assert.deepEqual(P.habits.map((h: any) => [h.id, h.unit, !!h.archived_at]), [['hm3a0k2c3', 'pages', false], ['walk', 'min', false], ['gaming', '', true], ['gone', '', true]]);
  assert.equal(P.habit_logs.length, 3); assert.equal(P.habit_sessions.length, 1);
  assert.equal(P.habit_sessions[0].started_at, new Date(1790348400000).toISOString());
  // checks: only ticked, not unticks
  assert.equal(P.check_ticks.length, 5);
  assert.deepEqual(P.hidden_checks, [{ check_id: 'photos', label: 'photos' }, { check_id: 'lab', label: 'Blood test' }]);
  assert.deepEqual(P.exercise_swaps, [{ program_key: 'fullA', original_name: 'Leg press', alternate_name: 'Goblet squat' }]);
  assert.deepEqual(P.food_cache_user.map((c: any) => [c.key, c.serving_g, c.kcal_100g, c.source]), [['v2:grilled halloumi wrap', 220, 254.5, 'claude']]);
  // reviews: newest per week, steps change mapped
  assert.equal(P.reviews.length, 1); assert.equal(P.reviews[0].change_steps, 9500); assert.equal(P.reviews[0].change_kcal, null); assert.match(P.reviews[0].out.headline, /steady/);
  assert.equal(P.reminders.length, 5); assert.equal(P.legacy_calendar_events[0].tag, 'ft-m3a0k9');
  assert.equal(S.days, 3); assert.equal(S.latestWeight?.kg, 80.6); assert.ok(notes.some((n) => /deleted/.test(n)));
});

test('refuses files that are not a backup, and handles a backup with no goal', () => {
  assert.throws(() => B.parseBackup({ app: 'other', entries: {} }), /not a Recomp backup/);
  assert.throws(() => B.parseBackup(null), /not a Recomp backup/);
  const r = B.parseBackup({ app: 'fitness-tracker', entries: { '2026-01-01': { w: 80 } } });
  assert.equal(r.payload.profile.setup_at, null); assert.equal(r.payload.goals.length, 0); assert.equal(r.summary.plan, 'default');
  assert.ok(r.notes.some((n) => /setup will ask/.test(n)));
});
