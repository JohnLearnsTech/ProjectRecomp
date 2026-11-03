// Setup wizard data and target maths, ported from recomp.html r19 (05-business-logic §2).

export type GoalKind = 'lose' | 'recomp' | 'muscle' | 'health';
export type Equip = 'gym' | 'home' | 'body' | 'homefirst';
export type HabitOpt = { name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number };

export const GOAL_TYPES: [GoalKind, string, string][] = [
  ['lose', 'Lose fat', 'Smaller, lighter, keep the muscle'],
  ['recomp', 'Recomp', 'Lose fat and build muscle at once'],
  ['muscle', 'Build muscle', 'Bigger and stronger'],
  ['health', 'Feel better', 'Energy, sleep, habits; weight is secondary'],
];
export const EQUIP: [Equip, string][] = [['gym', 'A gym'], ['home', 'Home: dumbbells and bands'], ['body', 'No equipment'], ['homefirst', 'Home now, gym later']];
export const WEEKS = [8, 12, 16, 24];
export const STEP_CHOICES: [number, string][] = [[3000, 'Under 4k'], [5000, '4–7k'], [8000, '7–10k'], [11000, '10k+']];
export const HABIT_OPTS: HabitOpt[] = [
  { name: 'Walk', type: 'build', unit: 'min', goal: 20, step: 5 },
  { name: 'Read', type: 'build', unit: 'pages', goal: 10, step: 5 },
  { name: 'Meditate', type: 'build', unit: 'min', goal: 10, step: 5 },
  { name: 'Deep work', type: 'build', unit: 'h', goal: 2, step: 0.5 },
  { name: 'Screen time', type: 'limit', unit: 'h', goal: 2, step: 0.5 },
  { name: 'No sugar', type: 'limit', unit: 'times', goal: 0, step: 1 },
  { name: 'Journal', type: 'build', unit: 'times', goal: 1, step: 1 },
  { name: 'Stretch', type: 'build', unit: 'min', goal: 10, step: 5 },
];
export const habitOptLabel = (x: HabitOpt) => x.name + (x.type === 'limit' ? ' under ' + (x.goal ? x.goal + ' ' + x.unit : 'zero') : ' ' + x.goal + ' ' + x.unit);
export const GOAL_NAMES: Record<GoalKind, string> = { lose: 'Lean out', recomp: 'Recomp', muscle: 'Build muscle', health: 'Feel better' };

export type Answers = {
  name: string; sex: 'female' | 'male' | ''; age: string; height: string; weight: string;
  type: GoalKind; weeks: number; goalName: string; target: string;
  equip: Equip; days: number; joint: boolean; steps: number; cuisine: string; habits: string[];
};

/** Mifflin-St Jeor with an activity factor from steps and training days. */
export function calcTargets(a: { weight: number | string; height: number | string; age: number | string; sex: string; steps?: number; days?: number; type: string; weeks?: number }) {
  const w = +a.weight, h = +a.height, age = +a.age, s = a.sex;
  const bmr = 10 * w + 6.25 * h - 5 * age + (s === 'male' ? 5 : s === 'female' ? -161 : -78);
  const sn = +(a.steps ?? 0) || 5000, f = (sn < 5000 ? 1.25 : sn < 8000 ? 1.35 : sn < 10000 ? 1.45 : 1.55) + 0.02 * (+(a.days ?? 0) || 3);
  const tdee = bmr * f, floor = s === 'female' ? 1200 : s === 'male' ? 1500 : 1400;
  let kc = a.type === 'lose' ? tdee - Math.min(900, tdee * 0.22) : a.type === 'recomp' ? tdee * 0.9 : a.type === 'muscle' ? tdee * 1.1 : tdee;
  kc = Math.max(floor, Math.round(kc / 50) * 50);
  const ref = Math.min(w, 25 * Math.pow(h / 100, 2)); // weight at BMI 25, so protein is not overstated
  const protein = Math.round(((a.type === 'muscle' ? 2.0 : a.type === 'health' ? 1.4 : 1.8) * ref) / 5) * 5;
  const steps = Math.min(12000, Math.max(6000, Math.round((sn + 2000) / 500) * 500));
  const wk = +(a.weeks ?? 0) || 12, tw = a.type === 'lose' ? w * (1 - 0.0065 * wk) : a.type === 'muscle' ? w * (1 + 0.0025 * wk) : w;
  return { kcal: kc, protein, steps, floor, tdee: Math.round(tdee), targetKg: Math.round(tw * 2) / 2 };
}

/** First step's gate: the field to fix, or null. */
export const aboutYouProblem = (a: Pick<Answers, 'age' | 'height' | 'weight'>) =>
  !(+a.age >= 13 && +a.age <= 100) ? 'age' : !(+a.height >= 120 && +a.height <= 230) ? 'height' : !(+a.weight >= 30 && +a.weight <= 350) ? 'weight' : null;
