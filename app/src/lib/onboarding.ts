import { addDays, d, key } from '../domain/dates';
import { calcTargets, GOAL_NAMES, HABIT_OPTS, type Answers } from '../domain/onboarding';
import type { OnboardingPayload } from './db';

/** r19 finishOnboarding(), as the payload for the finish_onboarding transaction. */
export function buildOnboarding(A: Answers, today: string): OnboardingPayload {
  const t = calcTargets(A), w = +A.weight;
  return {
    day: today,
    weight_kg: w,
    goal: {
      name: A.goalName.trim().slice(0, 40) || GOAL_NAMES[A.type], type: A.type,
      due_date: key(addDays(d(today), (+A.weeks || 12) * 7 - 1)),
      target_kg: +A.target > 30 ? +A.target : t.targetKg,
      kcal: t.kcal, protein_g: t.protein, steps: t.steps, home_first: A.equip === 'homefirst',
    },
    profile: {
      name: A.name.trim().slice(0, 30), sex: A.sex || 'unspecified', age: +A.age, height_cm: +A.height, cuisine: A.cuisine.trim().slice(0, 40),
      equipment: A.equip === 'homefirst' ? 'gym' : A.equip, training_days: +A.days || 3, joint_friendly: !!A.joint,
    },
    habits: HABIT_OPTS.filter((x) => A.habits.includes(x.name)).slice(0, 3),
  };
}
