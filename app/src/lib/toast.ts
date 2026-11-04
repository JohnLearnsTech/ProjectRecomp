// r19 showToast(text, "Undo", fn): one short message at a time, with an optional Undo.
import { useSyncExternalStore } from 'react';

export type Toast = { id: number; text: string; undo?: () => unknown };
let cur: Toast | null = null, n = 0, timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function toast(text: string, undo?: () => unknown) {
  cur = { id: ++n, text, undo };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { cur = null; emit(); }, undo ? 6000 : 3000);
  emit();
}
export function dismissToast() { cur = null; if (timer) clearTimeout(timer); emit(); }
export const useToast = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur, () => cur);
