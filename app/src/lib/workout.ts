// Session-mode state kept on the device, like r19's goa:wo and goa:rest (never synced).
// localStorage here is expo-sqlite's, installed by lib/supabase.ts.
import type { SetEntry } from './db';
import type { SetHistory, Set_ } from '../domain/training';

/** short: the 10-minute version, the first two exercises (the lift-day floor). */
export type Wo = { day: string; session: string; start: number; idx: number; done?: boolean; short?: boolean };

const read = <T>(k: string, dflt: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : dflt; } catch { return dflt; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* device storage full or unavailable */ } };

export const loadWo = () => read<Wo | null>('goa:wo', null);
export const saveWo = (wo: Wo | null) => write('goa:wo', wo);
export const loadRestLen = () => { const v = read<number>('goa:rest', 90); return v >= 30 && v <= 300 ? v : 90; };
export const saveRestLen = (s: number) => write('goa:rest', s);
export const loadWarm = () => read<boolean>('goa:warm', true);
export const saveWarm = (v: boolean) => write('goa:warm', v);

/** The person's lifting trigger, an implementation intention: "Before my walk at 10:30, I do my
 *  two exercises. If I miss it, before my 18:00 walk." Times are HH:MM; backup may be null. */
export type Cue = { anchor: string; at: string; backup: string | null };
export const loadCue = () => read<Cue | null>('recomp:cue', null);
export const saveCue = (c: Cue | null) => write('recomp:cue', c);
/** HH:MM shifted by n minutes, clamped to the same day. */
export const shiftTime = (hhmm: string, n: number) => {
  const [h, m] = hhmm.split(':').map(Number), t = Math.max(0, Math.min(1439, h * 60 + m + n));
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};
export const fmt12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; };

/** set_entries rows to r19's entries[date].sets[name] arrays (set_no 1-based, gaps kept as {}). */
export function toHistory(rows: SetEntry[]): SetHistory {
  const h: SetHistory = {};
  rows.forEach((r) => {
    const day = (h[r.date] ||= {}), arr = (day[r.exercise_name] ||= []);
    while (arr.length < r.set_no) arr.push({});
    const x: Set_ = {};
    if (r.weight_kg != null) x.w = +r.weight_kg;
    if (r.reps != null) x.r = +r.reps;
    if (r.band_slot != null) x.b = r.band_slot;
    arr[r.set_no - 1] = x;
  });
  return h;
}
