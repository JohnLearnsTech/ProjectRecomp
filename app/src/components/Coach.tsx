// Today's two coaching cards. Both read the log and say one specific thing:
//  - WeekBudget: after a day well over the calorie target, what the rest of the week needs.
//  - HabitResize: a build habit missed five days running gets an offer to shrink its goal, and
//    one that has been shrunk and is being met gets an offer to step back up.
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, d, key } from '../domain/dates';
import { habitMet, type HabitDef } from '../domain/days';
import { kcalFloor } from '../domain/plan';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

const n = (x: number) => Math.round(x).toLocaleString('en-IN');
const read = <T,>(k: string, dflt: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : dflt; } catch { return dflt; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/** Monday-to-Sunday calorie budget: shown once a logged day this week runs 300 kcal or more over. */
export function WeekBudget() {
  const { engine, day, maxDay } = useRecomp();
  const { entries, loaded } = useDays();
  const { c, s } = useTheme('food');
  if (!loaded || day !== maxDay) return null;
  const mx = d(maxDay), mon = addDays(mx, -((mx.getUTCDay() + 6) % 7));
  let budget = 0, eaten = 0, left = 0, leftTarget = 0, worst = 0, todayLogged = false;
  for (let i = 0; i < 7; i++) {
    const k = key(addDays(mon, i)), P = engine.plan(k);
    if (!P.inRange) return null;
    budget += P.kcal;
    const kc = +(entries[k]?.kcal ?? 0);
    if (k < maxDay) { eaten += kc > 0 ? kc : P.kcal; worst = Math.max(worst, kc - P.kcal); }      // an unlogged day is taken as on target
    else if (k === maxDay) { todayLogged = kc > P.kcal; if (todayLogged) { eaten += kc; worst = Math.max(worst, kc - P.kcal); } else { left++; leftTarget += P.kcal; } }
    else { left++; leftTarget += P.kcal; }
  }
  const over = eaten + leftTarget - budget;
  if (worst < 300 || over < 150) return null;
  const floor = kcalFloor(engine.PROFILE), target = left ? leftTarget / left : 0;
  const need = left ? (budget - eaten) / left : 0, fromToday = !todayLogged;
  const days = `${left} day${left > 1 ? 's' : ''}`;
  let line: string;
  if (!left) line = `The week closes ${n(over)} kcal over. It is one week. Tomorrow starts a new one at your normal target; do not cut to make up for it.`;
  else if (need >= floor) line = `Eat about ${n(Math.round(need / 10) * 10)} kcal a day for the ${fromToday ? 'rest of the week, today included' : 'rest of the week'} (${days}) and the week still lands on target. That is ${n(target - need)} under your usual ${n(target)}.`;
  else line = `Even at your ${n(floor)} kcal floor for the remaining ${days}, the week ends about ${n(eaten + floor * left - budget)} kcal over. Do not go below the floor to fix it. Eat at your normal target, keep protein up, add a walk, and let this one go.`;
  return (
    <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: c.warn, gap: 6 }]}>
      <Text style={s.label}>This week’s calories</Text>
      <Text style={[s.body, { fontFamily: font.bold }]}>{n(over)} kcal over budget so far</Text>
      <Text style={s.body2}>{line}</Text>
    </View>
  );
}

type Shrunk = Record<string, { orig: number }>;
const SNOOZE = 'recomp:habitsnooze', SHRUNK = 'recomp:habitshrunk';
/** A much smaller goal, on the habit's own step: a quarter, and never under one step. */
const smaller = (h: HabitDef) => { const st = h.step > 0 ? h.step : 1; return Math.max(st, Math.round((h.goal / 4) / st) * st); };
const unit = (h: HabitDef, v: number) => `${+v.toFixed(2)}${h.unit ? ' ' + h.unit : ''}`;

export function HabitResize() {
  const { day, maxDay, engine, touch } = useRecomp();
  const { D, habits, loaded, reload } = useDays();
  const { c, s } = useTheme('habit');
  const [, bump] = useState(0);
  if (!loaded || day !== maxDay) return null;
  const snooze = read<Record<string, string>>(SNOOZE, {}), shrunk = read<Shrunk>(SHRUNK, {});
  const metOn = (h: HabitDef, back: number) => { const k = key(addDays(d(maxDay), -back)); if (k < engine.T.START) return null; const v = D.habitVal(k, h.id); return v != null && habitMet(h, v); };
  const build = habits.filter((h) => h.type === 'build' && h.goal > 0 && (snooze[h.id] ?? '') < maxDay);
  // Step back up first: a shrunk habit met on five of the last seven days.
  const up = build.find((h) => shrunk[h.id] && shrunk[h.id].orig > h.goal && [1, 2, 3, 4, 5, 6, 7].filter((b) => metOn(h, b) === true).length >= 5);
  // Otherwise shrink: missed on each of the last five days, with room to go down.
  const down = up ? undefined : build.find((h) => smaller(h) < h.goal && [1, 2, 3, 4, 5].every((b) => metOn(h, b) === false));
  const h = up ?? down;
  if (!h) return null;
  const st = h.step > 0 ? h.step : 1;
  const to = up ? Math.min(shrunk[h.id].orig, Math.max(h.goal + st, Math.round((h.goal * 2) / st) * st)) : smaller(h);
  const later = () => { write(SNOOZE, { ...snooze, [h.id]: key(addDays(d(maxDay), 7)) }); bump((x) => x + 1); };
  const apply = async () => {
    try {
      await db.updateHabit(h.id, { goal: to });
      const m = { ...shrunk };
      if (up) { if (to >= shrunk[h.id].orig) delete m[h.id]; } else m[h.id] = { orig: shrunk[h.id]?.orig ?? h.goal };
      write(SHRUNK, m); write(SNOOZE, { ...snooze, [h.id]: key(addDays(d(maxDay), 5)) });
      await reload(); touch();
    } catch { /* the card stays; try again */ }
  };
  return (
    <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: c.cat.habit.fill, gap: 8 }]}>
      <Text style={s.label}>{up ? 'Ready for more' : 'Make it winnable'}</Text>
      <Text style={[s.body, { fontFamily: font.bold }]}>{up ? `${h.name}: you have hit ${unit(h, h.goal)} most days this week` : `${h.name}: missed five days running`}</Text>
      <Text style={s.body2}>{up ? `Step it up to ${unit(h, to)}? Your original goal was ${unit(h, shrunk[h.id].orig)}.`
        : `A goal you never hit teaches you to ignore it. Shrink it from ${unit(h, h.goal)} to ${unit(h, to)} for now. Once you are hitting that most days, the app offers to raise it again.`}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[s.primary, { flex: 1, minHeight: 44 }]} onPress={apply}><Text style={s.primaryText}>{up ? `Raise to ${unit(h, to)}` : `Shrink to ${unit(h, to)}`}</Text></Pressable>
        <Pressable style={[s.outline, { minHeight: 44 }]} onPress={later}><Text style={s.outlineText}>{up ? 'Not yet' : `Keep ${unit(h, h.goal)}`}</Text></Pressable>
      </View>
    </View>
  );
}
