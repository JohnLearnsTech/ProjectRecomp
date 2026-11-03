// r19 date primitives (05-business-logic §1.1). Day keys are calendar dates; all
// arithmetic is in UTC so DST never shifts a day. Only "what day is it" uses local time.
export const d = (s: string) => { const p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); };
export const key = (dt: Date) => dt.toISOString().slice(0, 10);
export const addDays = (dt: Date, n: number) => { const x = new Date(dt.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };
export const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
export const addKey = (k: string, n: number) => key(addDays(d(k), n));
export const localKey = (ms = Date.now()) => {
  const t = new Date(ms);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
export const todayKey = () => localKey();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Mon, 05 Oct 2026" */
export const fmt = (dt: Date) => `${DAY[dt.getUTCDay()]}, ${String(dt.getUTCDate()).padStart(2, '0')} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
/** "05 Oct" */
export const shortDate = (dt: Date) => `${String(dt.getUTCDate()).padStart(2, '0')} ${MON[dt.getUTCMonth()]}`;
export const dayLetter = (dt: Date) => DAY[dt.getUTCDay()][0];
/** Monday on or before k. */
export const mondayOf = (k: string) => { const dt = d(k); return key(addDays(dt, -((dt.getUTCDay() + 6) % 7))); };
export const trimNum = (x: number) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '');
