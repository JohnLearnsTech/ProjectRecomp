// Steps from the phone, through Android's Health Connect: the shared store that Samsung Health,
// Google Fit and phones' built-in step counters write to. Expo's pedometer only counts while
// the app is open, so it would miss walks; Health Connect has the whole day.
//
// Only steps taken while the walk timer runs count, so pottering around the house doesn't.
// Read-only, Android only. A number typed or corrected by hand is kept (see SYNCED).
import { Platform } from 'react-native';
import { addKey } from '../domain/dates';
import * as db from './db';

export const stepsSupported = Platform.OS === 'android';
const FLAG = 'recomp:hcsteps';
export const stepsConnected = () => { try { return stepsSupported && localStorage.getItem(FLAG) === 'on'; } catch { return false; } };
const setFlag = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, 'on'); else localStorage.removeItem(FLAG); } catch { /* ignore */ } };

const hc = () => require('react-native-health-connect') as typeof import('react-native-health-connect');

/** Asks for permission to read steps. Throws a plain-language message when it can't. */
export async function connectSteps() {
  if (!stepsSupported) throw new Error('Step syncing works in the Android app.');
  const H = hc();
  const st = await H.getSdkStatus();
  if (st === H.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) throw new Error('Health Connect needs an update. Update it from the Play Store, then try again.');
  if (st !== H.SdkAvailabilityStatus.SDK_AVAILABLE) throw new Error('Health Connect isn’t available on this phone. Install it from the Play Store, then try again.');
  await H.initialize();
  const got = await H.requestPermission([{ accessType: 'read', recordType: 'Steps' }]);
  const ok = got.some((p) => 'recordType' in p && p.recordType === 'Steps' && p.accessType === 'read');
  if (!ok) throw new Error('Permission to read steps wasn’t given. You can allow it in Health Connect, under App permissions.');
  setFlag(true);
}

export function disconnectSteps() { setFlag(false); }
export function openStepSources() { if (stepsSupported) hc().openHealthConnectSettings(); }

// What the last sync wrote for each day. A day is only rewritten while it still holds that number,
// so a count the person typed or corrected by hand is left alone.
const SYNCED = 'recomp:hcsynced';
const readSynced = (): Record<string, number> | null => { try { const v = localStorage.getItem(SYNCED); return v ? JSON.parse(v) : null; } catch { return null; } };
const writeSynced = (m: Record<string, number>) => { try { localStorage.setItem(SYNCED, JSON.stringify(m)); } catch { /* ignore */ } };
const midnight = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));

let last = 0;
/** Steps taken during walk-timer sessions only (pauses excluded: each running stretch is its own
 *  session), summed per day for the last `days` days. Returns the days that changed and each day's walk-timer total. Throttled
 *  to once a minute unless forced; quiet on any failure. */
export async function syncSteps(o: { today: string; start: string; have: (k: string) => number | null; walkIds: string[]; days?: number; force?: boolean }) {
  const days = o.days ?? 7;
  const none = { changed: [] as string[], totals: {} as Record<string, number> };
  if (!stepsConnected() || !o.walkIds.length || (!o.force && Date.now() - last < 60000)) return none;
  last = Date.now();
  const H = hc();
  try {
    if (!(await H.initialize())) return none;
    const count = async (a: Date, b: Date) => b > a ? Math.round((await H.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: a.toISOString(), endTime: b.toISOString() } })).COUNT_TOTAL || 0) : 0;
    const from = addKey(o.today, -(days - 1)) < o.start ? o.start : addKey(o.today, -(days - 1));
    const sessions = await db.listHabitSessionsRange(from, o.today, o.walkIds);
    let synced = readSynced();
    // The first version synced whole-day totals with no record. Treat a day still holding its
    // whole-day count as synced, so it moves to the walk-only number.
    if (!synced) {
      synced = {};
      for (let k = from; k <= o.today; k = addKey(k, 1)) {
        const whole = await count(midnight(k), k === o.today ? new Date() : midnight(addKey(k, 1)));
        if (whole > 0 && o.have(k) === whole) synced[k] = whole;
      }
    }
    const changed: string[] = [], totals: Record<string, number> = {};
    for (let k = from; k <= o.today; k = addKey(k, 1)) {
      let n = 0;
      for (const x of sessions.filter((y) => y.date === k)) n += await count(new Date(x.started_at), new Date(x.ended_at));
      totals[k] = n;
      const cur = o.have(k), mine = cur == null || cur === 0 || cur === synced[k];
      if (!mine) continue;
      const next = n > 0 ? n : null;
      if ((cur ?? null) !== next && !(next == null && !synced[k])) { await db.saveDayFields(k, { steps: next }); changed.push(k); }
      if (next != null) synced[k] = next; else delete synced[k];
    }
    writeSynced(synced);
    return { changed, totals };
  } catch {
    return none;
  }
}
