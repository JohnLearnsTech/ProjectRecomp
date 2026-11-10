// Steps from the phone, through Android's Health Connect: the shared store that Samsung Health,
// Google Fit and phones' built-in step counters write to. Expo's pedometer only counts while
// the app is open, so it would miss walks; Health Connect has the whole day.
//
// Read-only, Android only. A synced count only ever raises a day's steps, so a higher number
// typed by hand (a walk with the phone left at home) is kept.
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

// Local midnight of a YYYY-MM-DD key, so a day's steps match the person's day.
const midnight = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));

let last = 0;
/** Pulls the last `days` days of steps and raises any day the phone counted more on. Returns the
 *  days that changed. Throttled to once a minute; quiet on any failure. */
export async function syncSteps(today: string, start: string, have: (k: string) => number | null, days = 7) {
  if (!stepsConnected() || Date.now() - last < 60000) return [] as string[];
  last = Date.now();
  const H = hc();
  try {
    if (!(await H.initialize())) return [];
    const changed: string[] = [];
    for (let i = 0; i < days; i++) {
      const k = addKey(today, -i);
      if (k < start) break;
      const from = midnight(k), to = i === 0 ? new Date() : midnight(addKey(k, 1));
      const r = await H.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() } });
      const n = Math.round(r.COUNT_TOTAL || 0);
      if (n > 0 && n > (have(k) ?? 0)) { await db.saveDayFields(k, { steps: n }); changed.push(k); }
    }
    return changed;
  } catch {
    return [];
  }
}
