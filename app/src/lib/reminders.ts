// Reminders (r19 remRows / remEvents). r19 wrote them to Google Calendar; on the phone they are
// local notifications at the same times, rebuilt from the plan whenever the person taps Update.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, d, key } from '../domain/dates';
import { planWeekdays } from '../domain/ai';
import type { Engine } from '../domain/plan';
import * as db from './db';

const REM_SKIP: Record<string, 1> = { waist: 1, photos: 1, lab: 1, task: 1, mobility: 1, train: 1, protein: 1, water: 1 };
const REM_TIME: Record<string, string> = { waking: '07:00', morning: '08:00', breakfast: '07:30', lunch: '13:00', afternoon: '16:00', evening: '20:00', dinner: '20:30', bedtime: '22:30', night: '22:45' };

export type RemRow = { k: string; label: string; sub: string; dflt: [string, boolean]; noTime?: boolean; off?: boolean };

export function remRows(engine: Engine, maxDay: string, userChecks: db.UserCheckRow[], hidden: Record<string, string | true>): RemRow[] {
  const { PL, T, G } = engine;
  const P = engine.plan(maxDay);
  const wn = planWeekdays(T.TSTART);
  const ph = PL.phases[(P.inRange ? P.phase : 1) - 1];
  const liftNames = wn.filter((_, i) => ph.weeks.some((w) => w[i] && w[i].t === 'lift'));
  const rows: RemRow[] = [{ k: 'train', label: 'Training days', sub: (liftNames.join(', ') || 'none') + ' this phase · follows each phase', dflt: ['18:30', true] }];
  const uc = userChecks.map((u) => ({ id: u.id, t: u.title, w: u.when_label, s: u.subtitle, builtinOnly: u.builtin_only }));
  engine.checkList(P, uc, hidden).filter((c) => !REM_SKIP[c.id]).forEach((c) => {
    rows.push({ k: 'chk:' + c.id, label: c.t, sub: 'Daily' + (c.w ? ' · ' + c.w : ''), dflt: [REM_TIME[String(c.w || '').toLowerCase()] || '09:00', false] });
  });
  const ms = (G.milestones || []).filter((m) => m && m.d >= maxDay);
  rows.push({ k: 'dates', label: 'Bloods and milestones', sub: ms.length ? ms.length + ' ahead · alert at 6 pm the day before and at 8 am' : 'none ahead (add them under Goal)', dflt: ['08:00', true], noTime: true, off: !ms.length });
  rows.push({ k: 'review', label: 'Weekly review', sub: 'Every ' + wn[6] + ' evening', dflt: ['19:00', true] });
  return rows;
}

const at = (k: string, hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); const t = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h, m, 0); return t; };

/** Clears Recomp's notifications and schedules the enabled ones for the next eight weeks. Returns how many. */
export async function scheduleReminders(engine: Engine, maxDay: string, rows: RemRow[], items: Record<string, { on: boolean; time: string }>) {
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Notifications are off for Recomp. Turn them on in Android settings, then try again.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('reminders', { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.cancelAllScheduledNotificationsAsync();
  const { PL, T, G } = engine;
  const now = Date.now(), horizon = key(addDays(d(maxDay), 56)), end = T.END < horizon ? T.END : horizon;
  const out: { title: string; body: string; when: Date }[] = [];
  const it = (k: string) => items[k];
  // Lift days, phase by phase, at the training time.
  if (it('train')?.on) {
    for (let k = maxDay; k <= end; k = key(addDays(d(k), 1))) {
      const p = engine.plan(k);
      if (p.type === 'lift' && p.session) out.push({ title: 'Lift · ' + String(PL.phases[p.phase - 1]?.name || '').split('·').pop()!.trim(), body: PL.programs[p.session]?.name + '. Open Recomp, Train, Start session.', when: at(k, it('train').time) });
    }
  }
  rows.filter((r) => r.k.startsWith('chk:') && it(r.k)?.on).forEach((r) => {
    for (let k = maxDay; k <= end; k = key(addDays(d(k), 1))) out.push({ title: r.label, body: 'Recomp · daily check', when: at(k, it(r.k).time) });
  });
  if (it('dates')?.on) (G.milestones || []).filter((m) => m.d >= maxDay && m.d <= end).forEach((m) => {
    const title = (m.k === 'lab' ? 'Bloods: ' : 'Milestone: ') + String(m.t).split(/[—.]/)[0].trim().slice(0, 70);
    out.push({ title, body: 'Tomorrow. ' + m.t, when: at(key(addDays(d(m.d), -1)), '18:00') });
    out.push({ title, body: 'Today. ' + m.t, when: at(m.d, '08:00') });
  });
  if (it('review')?.on) {
    const wn = planWeekdays(T.TSTART), last = wn[6];
    for (let k = maxDay; k <= end; k = key(addDays(d(k), 1))) if (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d(k).getUTCDay()] === last) out.push({ title: 'Weekly review · Recomp', body: 'Open Progress and review your week.', when: at(k, it('review').time) });
  }
  const due = out.filter((x) => x.when.getTime() > now + 60000).sort((a, b) => +a.when - +b.when).slice(0, 400);
  for (const x of due) {
    await Notifications.scheduleNotificationAsync({ content: { title: x.title, body: x.body }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: x.when, channelId: 'reminders' } });
  }
  return due.length;
}

export const clearReminders = () => Notifications.cancelAllScheduledNotificationsAsync();
export const scheduledCount = async () => (await Notifications.getAllScheduledNotificationsAsync()).length;
