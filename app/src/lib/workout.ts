// Session-mode state kept on the device, like r19's goa:wo and goa:rest (never synced).
// localStorage here is expo-sqlite's, installed by lib/supabase.ts.
import type { SetEntry } from './db';
import type { SetHistory, Set_ } from '../domain/training';

export type Wo = { day: string; session: string; start: number; idx: number; done?: boolean };

const read = <T>(k: string, dflt: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : dflt; } catch { return dflt; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* device storage full or unavailable */ } };

export const loadWo = () => read<Wo | null>('goa:wo', null);
export const saveWo = (wo: Wo | null) => write('goa:wo', wo);
export const loadRestLen = () => { const v = read<number>('goa:rest', 90); return v >= 30 && v <= 300 ? v : 90; };
export const saveRestLen = (s: number) => write('goa:rest', s);
export const loadWarm = () => read<boolean>('goa:warm', true);
export const saveWarm = (v: boolean) => write('goa:warm', v);

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
