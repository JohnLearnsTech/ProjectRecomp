// Sleep from Android's Health Connect, read-only, the same way lib/steps.ts reads steps. It only
// has sleep if something writes it there: a watch or band's app, or a sleep-tracking app. A night
// is filed under the day you woke up. Hours you typed yourself are kept (see SYNCED).
import { Platform } from 'react-native';
import { addKey } from '../domain/dates';
import * as db from './db';

export const sleepSupported = Platform.OS === 'android';
const FLAG = 'recomp:hcsleep', SYNCED = 'recomp:hcsleepsynced';
export const sleepConnected = () => { try { return sleepSupported && localStorage.getItem(FLAG) === 'on'; } catch { return false; } };
const setFlag = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, 'on'); else localStorage.removeItem(FLAG); } catch { /* ignore */ } };
const hc = () => require('react-native-health-connect') as typeof import('react-native-health-connect');

export async function connectSleep() {
  if (!sleepSupported) throw new Error('Sleep syncing works in the Android app.');
  const H = hc();
  if ((await H.getSdkStatus()) !== H.SdkAvailabilityStatus.SDK_AVAILABLE) throw new Error('Health Connect isn’t available on this phone. Install or update it from the Play Store, then try again.');
  await H.initialize();
  const got = await H.requestPermission([{ accessType: 'read', recordType: 'SleepSession' }]);
  if (!got.some((p) => 'recordType' in p && p.recordType === 'SleepSession' && p.accessType === 'read')) throw new Error('Permission to read sleep wasn’t given. You can allow it in Health Connect, under App permissions.');
  setFlag(true);
}
export function disconnectSleep() { setFlag(false); }

const local = (k: string, h: number) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h);
let last = 0;
/** Fills sleep hours for the last `days` days. A night counts for day k when it ends between
 *  6 pm the evening before and 2 pm on k; overlapping records from two apps are merged, not added. */
export async function syncSleep(o: { today: string; start: string; have: (k: string) => number | null; days?: number; force?: boolean }) {
  const none = { changed: [] as string[], found: 0 };
  if (!sleepConnected() || (!o.force && Date.now() - last < 60000)) return none;
  last = Date.now();
  try {
    const H = hc();
    if (!(await H.initialize())) return none;
    const days = o.days ?? 7, first = addKey(o.today, -(days - 1)) < o.start ? o.start : addKey(o.today, -(days - 1));
    const res = await H.readRecords('SleepSession', { timeRangeFilter: { operator: 'between', startTime: local(addKey(first, -1), 12).toISOString(), endTime: new Date().toISOString() } });
    const recs = res.records.map((r) => [+new Date(r.startTime), +new Date(r.endTime)] as [number, number]).filter(([a, b]) => b > a);
    let synced: Record<string, number> = {};
    try { synced = JSON.parse(localStorage.getItem(SYNCED) || '{}'); } catch { /* start clean */ }
    const changed: string[] = [];
    for (let k = first; k <= o.today; k = addKey(k, 1)) {
      const lo = +local(addKey(k, -1), 18), hi = +local(k, 14);
      const night = recs.filter(([, b]) => b > lo && b <= hi).sort((x, y) => x[0] - y[0]);
      let ms = 0, end = 0;
      for (const [a, b] of night) { const s = Math.max(a, end); if (b > s) { ms += b - s; end = b; } }
      const h = Math.round((ms / 3600000) * 10) / 10;
      if (!(h >= 1 && h <= 16)) continue;
      const cur = o.have(k);
      if (cur != null && cur !== synced[k]) continue;
      if (cur !== h) { await db.saveDayFields(k, { sleep_h: h }); changed.push(k); }
      synced[k] = h;
    }
    try { localStorage.setItem(SYNCED, JSON.stringify(synced)); } catch { /* ignore */ }
    return { changed, found: recs.length };
  } catch { return none; }
}
