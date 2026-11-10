// Habit timers and Pomodoro, kept on the device like r19's goa:timers, goa:pomo and goa:tmode
// (05-business-logic §6.3, §6.4). One timer runs at a time; a timer belongs to the day it was
// started on and its time goes back to that day when stopped, even after midnight.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { localKey } from '../domain/dates';

export type Seg = { s: number; e: number };
export type Timer = { running: boolean; startedAt: number; accumMs: number; day: string; segs: Seg[] };
export type Pomo = { phase: 'idle' | 'work' | 'break'; running: boolean; endsAt: number; remainMs: number; workMin: number; breakMin: number; targetId: string | null; cycles: number; cyclesDay?: string };

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...(d as object), ...JSON.parse(v) } as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

let timers: Record<string, Timer> = read('goa:timers', {});
let pomo: Pomo = read<Pomo>('goa:pomo', { phase: 'idle', running: false, endsAt: 0, remainMs: 25 * 60000, workMin: 25, breakMin: 5, targetId: null, cycles: 0 });
let clockMode: Record<string, 'up' | 'down'> = read('goa:tmode', {});
let version = 0;
const subs = new Set<() => void>();
const emit = () => { version++; write('goa:timers', timers); write('goa:pomo', pomo); write('goa:tmode', clockMode); subs.forEach((f) => f()); };

export function useTimerStore() {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
  return { timers, pomo, clockMode };
}
/** Re-render every second while anything is counting. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);
  return now;
}

/** The live timers, for the home screen widget (which reads and writes the same store). */
export const allTimers = () => timers;
export const timerMs = (id: string, now = Date.now()) => { const t = timers[id]; return t ? (t.accumMs || 0) + (t.running ? now - t.startedAt : 0) : 0; };
export const anyRunning = () => Object.values(timers).some((t) => t && t.running);
export function startTimer(id: string, day: string) {
  Object.keys(timers).forEach((o) => { if (o !== id && timers[o]?.running) pauseTimerRaw(o); });
  const t = timers[id];
  if (!t) timers[id] = { running: true, startedAt: Date.now(), accumMs: 0, day, segs: [] };
  else if (!t.running) { t.startedAt = Date.now(); t.running = true; }
  emit();
}
function pauseTimerRaw(id: string) {
  const t = timers[id];
  if (t && t.running) { const now = Date.now(); t.accumMs = (t.accumMs || 0) + (now - t.startedAt); (t.segs ||= []).push({ s: t.startedAt, e: now }); t.running = false; }
}
export const pauseTimer = (id: string) => { pauseTimerRaw(id); emit(); };
/** Ends the timer and hands back what to log: its day, total ms and segments. */
export function stopTimer(id: string): { day: string; ms: number; segs: Seg[] } | null {
  const t = timers[id]; if (!t) return null;
  const ms = timerMs(id), segs = (t.segs || []).slice();
  if (t.running) segs.push({ s: t.startedAt, e: Date.now() });
  delete timers[id]; emit();
  return { day: t.day, ms, segs: segs.filter((g) => g.e > g.s) };
}
export const cancelTimer = (id: string) => { delete timers[id]; emit(); };
export const toggleClockMode = (id: string) => { clockMode[id] = clockMode[id] === 'down' ? 'up' : 'down'; emit(); };

// ── Pomodoro ──
export const pomoBlocksToday = () => (pomo.cyclesDay === localKey() ? pomo.cycles || 0 : 0);
export const pomoRemain = (now = Date.now()) => (pomo.running ? Math.max(0, pomo.endsAt - now) : pomo.remainMs);
export function pomoStart() {
  if (pomo.phase === 'idle') { pomo.phase = 'work'; pomo.remainMs = pomo.workMin * 60000; }
  pomo.endsAt = Date.now() + pomoRemain(); pomo.running = true; emit();
}
export const pomoPause = () => { if (pomo.running) { pomo.remainMs = pomoRemain(); pomo.running = false; emit(); } };
/** Stop during focus logs the minutes done; returns them (0 if none). */
export function pomoStop() {
  const done = pomo.phase === 'work' ? pomo.workMin - Math.ceil(pomoRemain() / 60000) : 0;
  pomo.phase = 'idle'; pomo.running = false; pomo.remainMs = pomo.workMin * 60000; emit();
  return done > 0 ? done : 0;
}
export const pomoReset = () => { pomo.phase = 'idle'; pomo.running = false; pomo.remainMs = pomo.workMin * 60000; emit(); };
export function pomoSettings(p: Partial<Pick<Pomo, 'workMin' | 'breakMin' | 'targetId'>>) {
  if (p.workMin != null) pomo.workMin = Math.max(1, Math.min(120, Math.round(p.workMin)));
  if (p.breakMin != null) pomo.breakMin = Math.max(1, Math.min(60, Math.round(p.breakMin)));
  if (p.targetId !== undefined) pomo.targetId = p.targetId;
  if (pomo.phase === 'idle') pomo.remainMs = pomo.workMin * 60000;
  emit();
}
/** Called every second while a Pomodoro runs: returns minutes to log when a focus block ends. */
export function pomoTick(): number {
  if (!pomo.running || Date.now() < pomo.endsAt) return 0;
  let logged = 0;
  // r19 never resets "blocks today" (a noted quirk); here it restarts each calendar day.
  if (pomo.cyclesDay !== localKey()) { pomo.cycles = 0; pomo.cyclesDay = localKey(); }
  if (pomo.phase === 'work') { logged = pomo.workMin; pomo.cycles = (pomo.cycles || 0) + 1; pomo.phase = 'break'; pomo.endsAt = Date.now() + pomo.breakMin * 60000; }
  else { pomo.phase = 'work'; pomo.endsAt = Date.now() + pomo.workMin * 60000; }
  emit();
  return logged;
}
