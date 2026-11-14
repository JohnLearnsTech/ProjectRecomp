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
  /** The rank for the Level widget: number, name, colour, and how far to the next. */
  rank: { i: number; name: string; tint: string; motto: string; next: string | null; need: number; pct: number; span: number; done: number } | null;
  /** Up to six habits for the widget's chips; timed ones start a timer from the widget. */
  habits: { id: string; name: string; timed: boolean; val: string; met: boolean }[];
  /** Habits whose timer is a walk (the live step tracker follows those). */
  walkIds: string[];
  /** The lift trigger's time, short ("10:30"), for the Lift widget's label. */
  liftAt: string | null;
  /** Names of every habit, so a running timer can be labelled. */
  names: Record<string, string>;
  /** The habit timer as the app last saw it; the widget ticks it on from here. */
  timer: { id: string; name: string; running: boolean; elapsedMs: number; at: number; since: number } | null;
};

const KEY = 'recomp:widget';
export const readSnapshot = (): Snapshot | null => { try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as Snapshot) : null; } catch { return null; } };
export const writeSnapshot = (s: Snapshot) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
/** A snapshot from another day is stale: the widget says to open the app. */
export const isFresh = (s: Snapshot | null) => !!s && s.day === localKey();
