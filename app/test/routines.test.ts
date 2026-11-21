import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueOn, parseTime, splitSteps, slotsOf, type Routine } from '../src/domain/routines';

const base: Routine = { id: 'x', kind: 'skin', name: 'Night', steps: [], times: [], freq: 'daily', days: [], every_n: null, start_date: '2026-11-21', end_date: null, dose: null, note: null, remind: true, sort: 0 };

test('when a routine is due', () => {
  assert.equal(dueOn(base, '2026-11-21'), true);
  assert.equal(dueOn(base, '2026-11-20'), false, 'before it started');
  assert.equal(dueOn({ ...base, end_date: '2026-11-25' }, '2026-11-26'), false, 'after the course ends');
  assert.equal(dueOn({ ...base, freq: 'days', days: [1, 4] }, '2026-11-23'), true, 'a Monday');
  assert.equal(dueOn({ ...base, freq: 'days', days: [1, 4] }, '2026-11-24'), false, 'a Tuesday');
  assert.equal(dueOn({ ...base, freq: 'every', every_n: 3 }, '2026-11-24'), true);
  assert.equal(dueOn({ ...base, freq: 'every', every_n: 3 }, '2026-11-23'), false);
  assert.equal(dueOn({ ...base, freq: 'asneeded' }, '2026-11-21'), false);
});

test('times, steps and slots', () => {
  assert.equal(parseTime('9:30 pm'), '21:30'); assert.equal(parseTime('930'), '09:30'); assert.equal(parseTime('21.05'), '21:05');
  assert.equal(parseTime('25:00'), null); assert.equal(parseTime('13 pm'), null);
  assert.deepEqual(splitSteps('Cleanser, toner\nmoisturiser then sunscreen'), ['Cleanser', 'toner', 'moisturiser', 'sunscreen']);
  assert.deepEqual(splitSteps('1. Floss\n2. Brush'), ['Floss', 'Brush']);
  assert.deepEqual(slotsOf(base), [{ slot: 0, time: null }]);
  assert.deepEqual(slotsOf({ ...base, times: ['09:00', '21:00'] }).map((x) => x.time), ['09:00', '21:00']);
});
