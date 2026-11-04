/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addKey } from '../src/domain/dates';
import { floorFor, gameState, LEVELS } from '../src/domain/game';
import { makeEngine } from '../src/domain/plan';
import type { Entries, HabitDef } from '../src/domain/days';

const START = '2026-09-01';
const goal = { id: 'g', name: 'T', why: '', type: 'lose' as const, start: START, due: '2026-11-23', event: null, trainStart: START, startKg: 84, targetKg: 78,
  kcal: 2100, protein: 145, steps: 8000, homeFirst: false, done: false, milestones: [] };
const engine = makeEngine(goal, { sex: 'male', equip: 'gym', days: 3 }, null, null);
const walk: HabitDef = { id: 'walk', name: 'Walk', type: 'build', unit: 'min', goal: 10, step: 5 };
const typeOf = (k: string) => engine.plan(k).type;
const first = (t: string, from = START) => { let k = from; while (typeOf(k) !== t) k = addKey(k, 1); return k; };

test('floors: lift needs two exercises, cardio ten minutes, rest two of three', () => {
  const L = first('lift'), C = first('cardio'), R = first('rest');
  assert.equal(floorFor(engine, L, { sets: { A: [{ w: 40, r: 10 }] } }, [walk], 120, false).met, false);
  assert.equal(floorFor(engine, L, { sets: { A: [{ w: 40, r: 10 }], B: [{ r: 8 }] } }, [walk], 120, false).met, true);
  assert.equal(floorFor(engine, C, { habits: { walk: 9 } }, [walk], 120, false).met, false);
  assert.equal(floorFor(engine, C, { habits: { walk: 10 } }, [walk], 120, false).met, true);
  assert.equal(floorFor(engine, C, { steps: 2500 }, [walk], 120, false).met, true);
  assert.equal(floorFor(engine, R, { checks: { water: true } }, [walk], 120, false).met, false);
  assert.equal(floorFor(engine, R, { checks: { water: true }, protein: 130 }, [walk], 120, false).met, true);
});

test('comeback doubles, one miss a week is forgiven, levels follow days won', () => {
  // Cardio days only matter here: win every cardio day by walking, except one.
  const E: Entries = {};
  const maxDay = addKey(START, 27);
  const days: string[] = [];
  for (let k = START; k <= maxDay; k = addKey(k, 1)) days.push(k);
  days.forEach((k) => { const t = typeOf(k); E[k] = t === 'lift' ? { sets: { A: [{ w: 1, r: 1 }], B: [{ w: 1, r: 1 }] } } : t === 'cardio' ? { habits: { walk: 20 } } : { checks: { water: true, protein: true } }; });
  const miss = first('cardio', addKey(START, 7));
  E[miss] = {};
  const g = gameState({ engine, entries: E, habits: [walk], maxDay, pFloor: 120, trainedOn: () => false });
  assert.equal(g.totalWon, days.length - 1);
  const after = g.days[g.days.findIndex((x) => x.k === miss) + 1];
  assert.ok(after.comeback, 'the day after a miss is a comeback');
  const plain = g.days.find((x) => x.won && !x.comeback && x.type === after.type)!;
  assert.equal(after.pts, plain.pts * 2);
  assert.ok(g.days.every((x) => x.pts <= 200));
  assert.equal(g.streak, days.length - 1, 'the single miss is forgiven');
  const lv = LEVELS.filter(([n]) => g.totalWon >= n).length - 1;
  assert.equal(g.level.i, lv);
  assert.equal(g.badges.find((b) => b.id === 'back')!.at, after.k);
  // Two misses in the same week break the streak.
  const miss2 = days.find((k) => k > miss && k <= addKey(miss, 3) && typeOf(k) !== 'lift')!;
  E[miss2] = {};
  const g2 = gameState({ engine, entries: E, habits: [walk], maxDay, pFloor: 120, trainedOn: () => false });
  assert.ok(g2.streak < g.streak);
});

test('today counts only once won', () => {
  const k = first('cardio', addKey(START, 3));
  const g = gameState({ engine, entries: {}, habits: [walk], maxDay: k, pFloor: 120, trainedOn: () => false });
  assert.equal(g.today?.pending, true);
  assert.equal(g.streak, 0);
});
