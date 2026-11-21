// Routines on top of the database, plus their reminders: a notification for each due time over
// the next week, rebuilt whenever routines or ticks change, cancelled once the slot is done.
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { addKey, localKey } from '../domain/dates';
import { clock12, dueOn, slotsOf, type Routine, type RoutineLog } from '../domain/routines';
import { supabase } from './supabase';
import { useRecomp } from './recomp';

const must = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
const COLS = 'id, kind, name, steps, times, freq, days, every_n, start_date, end_date, dose, note, remind, sort';
export type NewRoutine = Omit<Routine, 'id' | 'sort'> & { sort?: number };

export const listRoutines = async () => must(await supabase.from('routines').select(COLS).is('archived_at', null).order('sort').order('name')) as Routine[];
export const addRoutine = async (r: NewRoutine) => must(await supabase.from('routines').insert(r).select(COLS).single()) as Routine;
export const updateRoutine = async (id: string, r: Partial<NewRoutine>) => { must(await supabase.from('routines').update(r).eq('id', id)); };
export const archiveRoutine = async (id: string, on = true) => { must(await supabase.from('routines').update({ archived_at: on ? new Date().toISOString() : null }).eq('id', id)); };
export const listRoutineLogs = async (from: string, to: string) =>
  must(await supabase.from('routine_logs').select('routine_id, date, slot, done, steps, done_at').gte('date', from).lte('date', to)) as RoutineLog[];
export async function setRoutineLog(routine_id: string, date: string, slot: number, patch: { done: boolean; steps: number[] }) {
  must(await supabase.from('routine_logs').upsert({ routine_id, date, slot, ...patch, done_at: patch.done ? new Date().toISOString() : null }, { onConflict: 'user_id,routine_id,date,slot' }));
  if (patch.done) await Notifications.cancelScheduledNotificationAsync(nid(routine_id, date, slot)).catch(() => {});
}

/** Routines and the last week of ticks, shared by the Routines tab and Today's glance. */
let listeners = new Set<() => void>(), version = 0;
export const routinesChanged = () => { version++; listeners.forEach((f) => f()); };
export function useRoutines() {
  const { maxDay, day, rev } = useRecomp();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [v, setV] = useState(version);
  useEffect(() => { const f = () => setV(version); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const load = useCallback(async () => {
    const from = addKey(maxDay, -6) < day ? addKey(maxDay, -6) : day;
    const [r, l] = await Promise.all([listRoutines(), listRoutineLogs(from, maxDay)]);
    setRoutines(r); setLogs(l); setLoaded(true);
  }, [maxDay, day]);
  useEffect(() => { load().catch(() => setLoaded(true)); }, [load, rev, v]);
  const logOf = useCallback((id: string, k: string, slot: number) => logs.find((x) => x.routine_id === id && x.date === k && x.slot === slot) ?? null, [logs]);
  /** A day's due slots (today unless one is picked), in time order, with whether each is done and whether its time has passed. */
  const slotsFor = useCallback((k: string) => {
    const now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
    return routines.filter((r) => dueOn(r, k)).flatMap((r) => slotsOf(r).map((s) => {
      const lg = logOf(r.id, k, s.slot), at = s.time ? +s.time.slice(0, 2) * 60 + +s.time.slice(3) : null;
      return { r, ...s, log: lg, done: !!lg?.done, late: !lg?.done && (k < localKey() || (at != null && k === localKey() && at + 60 < mins)) };
    })).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  }, [routines, logOf]);
  const today = useMemo(() => slotsFor(maxDay), [slotsFor, maxDay]);
  return { routines, logs, loaded, logOf, slotsFor, today, reload: load };
}

// ── Reminders ──
const nid = (id: string, k: string, slot: number) => `rt:${id}:${k}:${slot}`;
const DAYS = 7;
let syncing: Promise<void> | null = null;
/** Clears every routine reminder and schedules the next week's again. Quiet when notifications are off. */
export function syncRoutineReminders() {
  if (Platform.OS === 'web') return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(all.filter((n) => n.identifier.startsWith('rt:')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
      if (!(await Notifications.getPermissionsAsync()).granted) return;
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('routines', { name: 'Routines and medicines', importance: Notifications.AndroidImportance.HIGH });
      await Notifications.setNotificationCategoryAsync('routine', [{ identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: true } }]);
      const today = localKey(), rs = (await listRoutines()).filter((r) => r.remind && r.times.length);
      const logs = await listRoutineLogs(today, addKey(today, DAYS));
      const now = Date.now() + 30000;
      for (let i = 0; i < DAYS; i++) {
        const k = addKey(today, i);
        for (const r of rs) {
          if (!dueOn(r, k)) continue;
          for (const s of slotsOf(r)) {
            if (!s.time || logs.some((x) => x.routine_id === r.id && x.date === k && x.slot === s.slot && x.done)) continue;
            const when = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), +s.time.slice(0, 2), +s.time.slice(3));
            if (when.getTime() <= now) continue;
            const med = r.kind === 'medicine' || r.kind === 'supplement';
            await Notifications.scheduleNotificationAsync({
              identifier: nid(r.id, k, s.slot),
              content: {
                title: med ? `${r.name}${r.dose ? ' · ' + r.dose : ''}` : r.name,
                body: r.steps.length ? r.steps.join(' → ') : med ? `Due at ${clock12(s.time)}. Tap Done once taken.` : `Due at ${clock12(s.time)}.`,
                data: { url: '/routines', routine: r.id, date: k, slot: s.slot }, categoryIdentifier: 'routine',
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'routines' },
            });
          }
        }
      }
    } catch { /* reminders are best effort */ } finally { syncing = null; }
  })();
  return syncing;
}
