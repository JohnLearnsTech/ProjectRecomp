// The app's side of the live walk tracker (modules/walk-tracker). The habit timer stays the
// source of truth: when a walk timer runs, the tracker runs; paused, it pauses; stopped through
// the app, its steps are added to the day. Pauses tapped on the notification are replayed onto
// the timer when the app comes back.
import { PermissionsAndroid, Platform } from 'react-native';
import Walk, { type WalkState } from '../../modules/walk-tracker';
import { pauseTimerAt, resumeTimerAt } from './habitTimers';

export const walkSupported = Platform.OS === 'android' && !!Walk;
export const hasStepSensor = () => { try { return !!Walk?.hasStepSensor(); } catch { return false; } };
export const walkState = (): WalkState | null => { try { return Walk?.state() ?? null; } catch { return null; } };

// Days whose steps came from the tracker: Health Connect syncing leaves those alone.
const KEY = 'recomp:sensorDays';
export const sensorDays = (): Record<string, true> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const markSensorDay = (k: string) => { try { localStorage.setItem(KEY, JSON.stringify({ ...sensorDays(), [k]: true })); } catch { /* ignore */ } };

/** Activity recognition (Android 10+) and notifications (13+), asked once each. */
export async function walkPermissions() {
  if (Platform.OS !== 'android') return false;
  const v = Number(Platform.Version);
  try {
    if (v >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never);
    if (v >= 29) return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION)) === PermissionsAndroid.RESULTS.GRANTED;
    return true;
  } catch { return false; }
}

export function startWalk(habitId: string, name: string, accumMs: number) {
  try { Walk?.start(habitId, name, accumMs, 0); return true; } catch { return false; }
}
export const pauseWalk = () => { try { Walk?.pause(); } catch { /* ignore */ } };
export const resumeWalk = () => { try { Walk?.resume(); } catch { /* ignore */ } };

/** Ends tracking for this habit and returns its steps (null when it wasn't being tracked). */
export function finishWalk(habitId: string, day: string): number | null {
  const st = walkState();
  if (!st?.active || st.habitId !== habitId) return null;
  try { const n = Walk!.stop(); markSensorDay(day); return n; } catch { return null; }
}
/** Drops tracking without keeping the steps (the timer was discarded). */
export const dropWalk = () => { try { if (walkState()?.active) Walk?.stop(); } catch { /* ignore */ } };

/** Replays pauses and resumes tapped on the notification onto the habit timer. */
export function replayWalkEvents(habitId: string) {
  let ev: string[] = [];
  try { ev = Walk?.takeEvents() ?? []; } catch { return 0; }
  ev.forEach((e) => { const [k, ms] = e.split(':'); if (k === 'p') pauseTimerAt(habitId, +ms); else if (k === 'r') resumeTimerAt(habitId, +ms); });
  return ev.length;
}
