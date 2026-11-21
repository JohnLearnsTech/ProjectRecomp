// Routines: skincare, haircare, dental care, medicines, supplements and anything else done on a
// schedule. Pure rules here (what is due on a day, templates, frequency presets); storage and
// reminders are in lib/routines.ts.
import { addKey, d, diffDays } from './dates';

export type RoutineKind = 'medicine' | 'supplement' | 'skin' | 'hair' | 'dental' | 'other';
export type Freq = 'daily' | 'days' | 'every' | 'asneeded';
export type Routine = {
  id: string; kind: RoutineKind; name: string; steps: string[]; times: string[]; freq: Freq; days: number[]; every_n: number | null;
  start_date: string; end_date: string | null; dose: string | null; note: string | null; remind: boolean; sort: number;
};
export type RoutineLog = { routine_id: string; date: string; slot: number; done: boolean; steps: number[]; done_at: string | null };

/** Sections in page order. */
export const KINDS: { k: RoutineKind; title: string; one: string; icon: string }[] = [
  { k: 'medicine', title: 'Medicines', one: 'Medicine', icon: '💊' },
  { k: 'supplement', title: 'Supplements', one: 'Supplement', icon: '🧴' },
  { k: 'skin', title: 'Skincare', one: 'Skincare', icon: '✨' },
  { k: 'hair', title: 'Haircare', one: 'Haircare', icon: '💇' },
  { k: 'dental', title: 'Dental care', one: 'Dental care', icon: '🦷' },
  { k: 'other', title: 'Other routines', one: 'Routine', icon: '📋' },
];
export const kindOf = (k: RoutineKind) => KINDS.find((x) => x.k === k) ?? KINDS[KINDS.length - 1];

/** Starting points: tap one and edit. Steps follow the usual order; nothing here is medical advice. */
export const TEMPLATES: Record<RoutineKind, { name: string; steps: string[]; times: string[] }[]> = {
  skin: [
    { name: 'Morning skincare', steps: ['Cleanser', 'Moisturiser', 'Sunscreen'], times: ['08:00'] },
    { name: 'Night skincare', steps: ['Cleanser', 'Serum', 'Moisturiser'], times: ['22:30'] },
  ],
  hair: [
    { name: 'Hair wash', steps: ['Shampoo', 'Conditioner', 'Leave-in'], times: ['08:00'] },
    { name: 'Hair oiling', steps: ['Oil the scalp', 'Leave in', 'Wash out'], times: ['20:00'] },
  ],
  dental: [
    { name: 'Morning teeth', steps: ['Brush 2 minutes', 'Tongue clean'], times: ['07:45'] },
    { name: 'Night teeth', steps: ['Floss', 'Brush 2 minutes', 'Mouthwash'], times: ['22:45'] },
  ],
  medicine: [], supplement: [
    { name: 'Vitamin D', steps: [], times: ['09:00'] }, { name: 'Creatine', steps: [], times: ['09:00'] }, { name: 'Fish oil', steps: [], times: ['13:30'] },
  ],
  other: [],
};

/** Medicine frequency presets: how many times a day, with times spread across waking hours. */
export const DOSE_PRESETS: { label: string; times: string[] }[] = [
  { label: 'Once a day', times: ['09:00'] },
  { label: 'Twice a day', times: ['09:00', '21:00'] },
  { label: '3 times a day', times: ['08:00', '14:00', '20:00'] },
  { label: '4 times a day', times: ['08:00', '12:00', '16:00', '20:00'] },
];

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const okTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
/** "9:30", "930", "9.30 pm", "21:30" to HH:MM; null when it doesn't read as a time. */
export function parseTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().replace('.', ':').match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1]; const mi = +(m[2] ?? 0);
  if (m[3]) { if (h < 1 || h > 12) return null; h = (h % 12) + (m[3] === 'pm' ? 12 : 0); }
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
export const clock12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

/** Steps typed the way food is: commas, new lines or "then" between them. */
export const splitSteps = (raw: string) => raw.split(/\n|,|;|\bthen\b/i).map((x) => x.trim().replace(/^[-•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 20);

/** Is the routine scheduled on day k (YYYY-MM-DD)? As-needed routines never are. */
export function dueOn(r: Routine, k: string) {
  if (r.freq === 'asneeded' || k < r.start_date || (r.end_date && k > r.end_date)) return false;
  if (r.freq === 'days') return r.days.includes(d(k).getUTCDay());
  if (r.freq === 'every') return diffDays(d(r.start_date), d(k)) % Math.max(2, r.every_n ?? 2) === 0;
  return true;
}
/** The day's slots: one per reminder time, or a single any-time slot. */
export const slotsOf = (r: Routine) => (r.times.length ? r.times.map((t, i) => ({ slot: i, time: t as string | null })) : [{ slot: 0, time: null as string | null }]);

export function freqText(r: Routine) {
  const n = r.times.length;
  const per = r.kind === 'medicine' || r.kind === 'supplement' ? (n > 1 ? `${n} times` : n === 1 ? 'once' : '') : '';
  const when = r.freq === 'daily' ? 'every day' : r.freq === 'days' ? (r.days.length === 7 ? 'every day' : [...r.days].sort().map((x) => DOW[x]).join(', '))
    : r.freq === 'every' ? `every ${r.every_n ?? 2} days` : 'as needed';
  return [per && r.freq !== 'asneeded' ? per : '', when].filter(Boolean).join(' · ') + (r.end_date ? ` · until ${r.end_date.slice(8)}/${r.end_date.slice(5, 7)}` : '');
}

/** The next day (from k, up to two months on) the routine is due, for "next: Thu". */
export function nextDue(r: Routine, k: string) { for (let i = 0; i < 62; i++) { const x = addKey(k, i); if (dueOn(r, x)) return x; } return null; }
