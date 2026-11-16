// Nudges the app works out from today's log, unlike lib/reminders.ts whose times are fixed:
// a protein check at 4 pm that names foods you already eat, and a second ask to lift a little
// after a walk ends. Both are local notifications on this phone.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { addDays, d, key } from '../domain/dates';
import * as db from './db';

const CHANNEL = 'reminders';
const at = (k: string, h: number, m: number) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h, m, 0);
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Only if the person already allowed notifications: a nudge never asks for the permission itself. */
async function ready() {
  if (Platform.OS === 'web') return false;
  const p = await Notifications.getPermissionsAsync();
  if (!p.granted) return false;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH });
  return true;
}
const cancel = (id: string) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
const schedule = (id: string, when: Date, title: string, body: string, url: string) =>
  Notifications.scheduleNotificationAsync({ identifier: id, content: { title, body, data: { url } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL } });

// ── Protein check ──
export const PROTEIN_HOUR = 16;
export const proteinNudgeOn = () => read('recomp:nudge:protein') !== '0';
export const setProteinNudge = (on: boolean) => write('recomp:nudge:protein', on ? '1' : '0');

type PFood = { name: string; g: number };
/** The two highest-protein things this person logs often (twice or more in 30 days), worked out once a day. */
async function proteinFoods(day: string): Promise<PFood[]> {
  try { const c = JSON.parse(read('recomp:pfoods') || 'null'); if (c?.day === day && Array.isArray(c.list)) return c.list; } catch { /* rebuild */ }
  const rows = await db.listFoodRange(key(addDays(d(day), -30)), day);
  const by = new Map<string, { name: string; n: number; g: number }>();
  rows.forEach((r) => {
    const name = String(r.label || '').replace(/\s*\(.*$/, '').trim(), k = name.toLowerCase();
    if (!k || !(+r.protein_g > 0)) return;
    const x = by.get(k) ?? { name, n: 0, g: 0 }; x.n++; x.g += +r.protein_g; by.set(k, x);
  });
  const list = [...by.values()].filter((x) => x.n >= 2 && x.g / x.n >= 12).map((x) => ({ name: x.name.length > 26 ? x.name.slice(0, 25).trimEnd() + '…' : x.name, g: Math.round(x.g / x.n) }))
    .sort((a, b) => b.g - a.g).slice(0, 2);
  write('recomp:pfoods', JSON.stringify({ day, list }));
  return list;
}

/**
 * Keeps the 4 pm protein check in line with the log: today's says where you are and what would
 * close the gap, and is dropped once half the target is in. Tomorrow's is a plain placeholder,
 * replaced the next time the app opens, so the check still arrives on a day the app stays shut.
 */
export async function syncProteinNudge(day: string, protein: number, target: number) {
  if (Platform.OS === 'web') return;
  const today = 'protein:' + day, next = key(addDays(d(day), 1)), tomorrow = 'protein:' + next;
  if (!proteinNudgeOn() || !(target > 0) || !(await ready())) { await cancel(today); await cancel(tomorrow); return; }
  const half = Math.round(target / 2), when = at(day, PROTEIN_HOUR, 0);
  if (when.getTime() > Date.now() + 60000) {
    if (protein >= half) await cancel(today);
    else {
      const f = await proteinFoods(day).catch(() => [] as PFood[]);
      const p = Math.round(protein);
      const fix = f.length === 2 ? `${f[0].name} (${f[0].g} g) and ${f[1].name} (${f[1].g} g) would take you to ${p + f[0].g + f[1].g} g.`
        : f.length === 1 ? `${f[0].name} (${f[0].g} g) would take you to ${p + f[0].g} g.` : 'Plan the rest of the day around a protein food.';
      await schedule(today, when, `Protein check: ${p} of ${Math.round(target)} g`, fix, '/food');
    }
  }
  await schedule(tomorrow, at(next, PROTEIN_HOUR, 0), 'Protein check', `Half of your ${Math.round(target)} g should be in by now. Open Recomp to see where you are.`, '/food');
}

// ── After a walk ──
/** The toast offers the session at once; this asks again once the person has had time to recover. */
export async function scheduleAfterWalk(day: string, sessionName: string, minutes = 20) {
  if (!(await ready())) return;
  await schedule('afterwalk:' + day, new Date(Date.now() + minutes * 60000), 'Rested? Two exercises, 10 minutes', `${sessionName}. The warm-up and the first two. Tap to start.`, '/session?short=1');
}
export const cancelAfterWalk = (day: string) => (Platform.OS === 'web' ? Promise.resolve() : cancel('afterwalk:' + day));
