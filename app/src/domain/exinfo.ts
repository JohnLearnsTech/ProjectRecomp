// What an exercise looks like and which muscles it works. The app's own exercises are matched
// by hand (scripts/build-exinfo.py); anything a custom plan brings in is matched by name against
// the whole Free Exercise DB (public domain), and failing that the muscles are read off the name.
import infoJson from './data/exinfo.json';
import indexJson from './data/exindex.json';

export type ExInfo = {
  /** Two photos (start and end of the movement), or null when nothing shows it. */
  frames: [string, string] | null;
  /** Set when the photos show a similar movement, not this exact one: that movement's name. */
  like: string | null;
  primary: string[]; secondary: string[];
};
type Row = { p: string[]; s: string[]; img?: string; n?: number; like?: string };
const INFO = infoJson as Record<string, Row>;
const INDEX = indexJson as [string, string, string[], string[]][];
const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const frames = (id: string): [string, string] => [`${BASE}${id}/0.jpg`, `${BASE}${id}/1.jpg`];

const SYN: Record<string, string> = { db: 'dumbbell', dbs: 'dumbbell', rdl: 'romanian deadlift', bb: 'barbell', ohp: 'overhead press', kb: 'kettlebell' };
const STOP = new Set(['a', 'the', 'on', 'at', 'to', 'with', 'and', 'or', 'of', 'your', 'hand', 'hands', 'in', 'one', 's', 'x']);
const tokens = (s: string) => {
  const out = new Set<string>();
  (s.toLowerCase().replace(/push-?ups?/g, 'pushup').replace(/pull-?ups?/g, 'pullup').replace(/step-?ups?/g, 'step up').match(/[a-z]+/g) ?? []).forEach((w) =>
    (SYN[w] ?? w).split(' ').forEach((q) => { const t = q.length > 3 ? q.replace(/s$/, '') : q; if (!STOP.has(t)) out.add(t); }));
  return out;
};
let indexTokens: Set<string>[] | null = null;
function fuzzy(name: string): Row | null {
  indexTokens ??= INDEX.map((r) => tokens(r[1]));
  const t = tokens(name); if (!t.size) return null;
  let best = -1, score = 0;
  indexTokens.forEach((u, i) => { let n = 0; t.forEach((w) => { if (u.has(w)) n++; }); const sc = n / (t.size + u.size - n); if (sc > score) { score = sc; best = i; } });
  if (best < 0 || score < 0.5) return null;
  const [id, nm, p, s] = INDEX[best];
  return { img: id, p, s, like: score >= 0.99 ? undefined : nm };
}

// Last resort: the muscles a name points at.
const WORDS: [RegExp, string[], string[]][] = [
  [/squat|leg press|lunge|step.?up|sit.to.stand|wall sit/, ['quadriceps', 'glutes'], ['hamstrings']],
  [/deadlift|rdl|hinge|good morning|pull.through|back extension/, ['hamstrings', 'glutes'], ['lower back']],
  [/hip thrust|glute|bridge/, ['glutes'], ['hamstrings']],
  [/leg curl|hamstring/, ['hamstrings'], []], [/leg extension/, ['quadriceps'], []], [/calf/, ['calves'], []],
  [/bench|chest|push.?up|fly|dip/, ['chest'], ['triceps', 'shoulders']],
  [/overhead press|shoulder press|military|arnold/, ['shoulders'], ['triceps']], [/lateral raise|upright row/, ['shoulders'], ['traps']],
  [/face pull|pull.apart|rear delt|reverse fly/, ['shoulders', 'middle back'], ['traps']],
  [/pulldown|pull.?up|chin/, ['lats'], ['biceps']], [/row/, ['middle back', 'lats'], ['biceps']],
  [/curl/, ['biceps'], ['forearms']], [/triceps|pushdown|extension|kickback|skull/, ['triceps'], []],
  [/plank|crunch|sit.?up|pallof|chop|carry|hold|twist|leg raise/, ['abdominals'], ['obliques']], [/shrug/, ['traps'], []],
];
const cache = new Map<string, ExInfo>();
export function exInfo(name: string): ExInfo {
  const hit = cache.get(name); if (hit) return hit;
  let r: Row | null = INFO[name] ?? fuzzy(name);
  if (!r) { const w = WORDS.find(([re]) => re.test(name.toLowerCase())); r = { p: w?.[1] ?? [], s: w?.[2] ?? [] }; }
  const v: ExInfo = { frames: r.img ? frames(r.img) : null, like: r.like ?? null, primary: r.p, secondary: r.s.filter((m) => !r!.p.includes(m)) };
  cache.set(name, v);
  return v;
}

/** The database's muscle words to the body diagram's regions, and to the words shown to the person. */
export const REGION: Record<string, string> = {
  abdominals: 'abs', obliques: 'obliques', abductors: 'gluteal', adductors: 'adductors', biceps: 'biceps', calves: 'calves', chest: 'chest', forearms: 'forearm',
  glutes: 'gluteal', hamstrings: 'hamstring', lats: 'upper-back', 'lower back': 'lower-back', 'middle back': 'upper-back', neck: 'neck', quadriceps: 'quadriceps',
  shoulders: 'deltoids', traps: 'trapezius', triceps: 'triceps',
};
export const MUSCLE_NAME: Record<string, string> = { abdominals: 'abs', quadriceps: 'quads', 'middle back': 'mid back', abductors: 'outer hips', adductors: 'inner thighs' };
export const muscleWords = (list: string[]) => list.map((m) => MUSCLE_NAME[m] ?? m).join(', ');
