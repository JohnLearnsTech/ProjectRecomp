// What the home screen widget shows. The app writes it whenever its data changes; the widget
// only reads it, so the widget never signs in, fetches or computes anything itself.
import 'expo-sqlite/localStorage/install';
import { localKey } from '../domain/dates';

export type Snapshot = {
  day: string;
  kcalLeft: number; kcalTarget: number;
  proteinLeft: number; proteinTarget: number;
  steps: number; stepsTarget: number;
  /** Lift-day state: todo, done, warm (warm-up only), or the day type when it isn't a lift day. */
  lift: 'todo' | 'done' | 'warm' | 'rest' | 'cardio' | 'off';
  liftLine: string;
  level: string | null; streak: number;
};

const KEY = 'recomp:widget';
export const readSnapshot = (): Snapshot | null => { try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Snapshot) : null; } catch { return null; } };
export const writeSnapshot = (s: Snapshot) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
/** A snapshot from another day is stale: the widget says to open the app. */
export const isFresh = (s: Snapshot | null) => !!s && s.day === localKey();
