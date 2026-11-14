// r19 showToast(text, "Undo", fn): one short message at a time, with an optional Undo.
import { useSyncExternalStore } from 'react';

export type Toast = { id: number; text: string; undo?: () => unknown; label?: string };
let cur: Toast | null = null, n = 0, timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** A short message; with an action it shows a button (Undo unless labelled) and stays longer. */
export function toast(text: string, undo?: () => unknown, label?: string, ms?: number) {
  cur = { id: ++n, text, undo, label };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { cur = null; emit(); }, ms ?? (undo ? 6000 : 3000));
  emit();
}
export function dismissToast() { cur = null; if (timer) clearTimeout(timer); emit(); }
export const useToast = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur, () => cur);
