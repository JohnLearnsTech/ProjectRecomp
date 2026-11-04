// The game state for the signed-in person, shared by Today, the week card and Progress.
import { useEffect, useMemo, useState } from 'react';
import { addKey } from '../domain/dates';
import { gameState, prDays } from '../domain/game';
import { proteinFloor } from '../domain/plan';
import * as db from './db';
import { useDays } from './days';
import { useRecomp } from './recomp';

/** This week's quests: the last review's non-negotiables, ticked on the review's end date. */
export function useQuests() {
  const { rev, maxDay } = useRecomp();
  const { entries } = useDays();
  const [review, setReview] = useState<db.ReviewRow | null>(null);
  useEffect(() => { db.getLatestReview().then(setReview).catch(() => {}); }, [rev]);
  const list: string[] = review?.out?.commitments ?? [];
  // Quests run for the seven days after the review, then the next review sets new ones.
  const live = !!review && maxDay > review.end_date && maxDay <= addKey(review.end_date, 7);
  const ticks = review ? entries[review.end_date]?.checks ?? {} : {};
  const done = list.map((_, i) => !!ticks['quest:' + i]);
  return { review, list, done, live, end: review?.end_date ?? null };
}

export function useGame() {
  const { engine, maxDay } = useRecomp();
  const { D, entries, habits, loaded, failed } = useDays();
  const q = useQuests();
  return useMemo(() => {
    // No game on a failed load: a partial history would look like a fresh start and celebrate it.
    if (!loaded || failed) return null;
    const prs = prDays(D.progExercises().map((x) => D.exSeries(x.nm)));
    return gameState({
      engine, entries, habits, maxDay, pFloor: proteinFloor(engine.PROFILE, engine.G), trainedOn: D.trainedOn, prDays: prs,
      questWeeks: q.end ? [{ end: q.end, done: q.done.filter(Boolean).length, of: q.list.length }] : [],
    });
  }, [loaded, failed, D, engine, entries, habits, maxDay, q.end, q.done.join(), q.list.length]); // eslint-disable-line react-hooks/exhaustive-deps
}
