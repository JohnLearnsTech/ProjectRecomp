import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultBands, isTimed, loadKind, sessionList, type Band, type SetHistory, type Set_ } from '../domain/training';
import * as db from './db';
import { useRecomp } from './recomp';
import { toHistory } from './workout';

/** Train and session mode share this: the day's session, history and the write operations. */
export function useTraining() {
  const { engine, day, maxDay, rev, touch, profileRow, reload: reloadAll } = useRecomp();
  const P = engine.plan(day);
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<SetHistory>({});
  const [log, setLog] = useState<db.DayLog | null>(null);
  const [trainTick, setTrainTick] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bands: Band[] = profileRow?.bands?.length === 5 ? profileRow.bands : defaultBands();

  const list = useMemo(() => sessionList(engine.PL, swaps, P.session), [engine.PL, swaps, P.session]);

  const load = useCallback(async () => {
    const rows = await db.listSwaps();
    const sw: Record<string, string> = {};
    rows.forEach((r) => { sw[r.program_key + '|' + r.original_name] = r.alternate_name; });
    const names = sessionList(engine.PL, sw, P.session).map((R) => R.name);
    const [sets, dl, ticks] = await Promise.all([db.listSetsForNames(names), db.getDayLog(day), db.listTicks(day, day)]);
    setSwaps(sw); setEntries(toHistory(sets)); setLog(dl);
    setTrainTick(ticks.some((t) => t.check_id === 'train' && t.done));
    setLoaded(true);
  }, [engine.PL, P.session, day]);
  useEffect(() => { load().catch(() => setLoaded(true)); }, [load, rev]);

  const today = entries[day] ?? {};

  /**
   * r19 writeSet, one field of one set. Reps entered on a set with no load of its own take the
   * nearest earlier set's load, written visibly so it can be corrected.
   */
  const writeCell = useCallback(async (name: string, sch: string, i: number, fld: 'w' | 'r' | 'b', value: number | null) => {
    const arr = (entries[day]?.[name] ?? []).map((x) => ({ ...x }));
    while (arr.length <= i) arr.push({});
    const x: Set_ = { ...arr[i], [fld]: value };
    if (value == null) delete x[fld];
    const kind = loadKind(name);
    if (fld === 'r' && value != null && kind !== 'body' && x.w == null && x.b == null) {
      for (let j = i - 1; j >= 0; j--) {
        const p = arr[j];
        if (kind === 'weight' && p.w != null) { x.w = p.w; break; }
        if (kind === 'band' && p.b != null) { x.b = p.b; break; }
      }
    }
    await db.writeSet(day, name, i + 1, { weight_kg: x.w ?? null, band_slot: x.b ?? null, reps: x.r ?? null, program_key: P.session, is_timed: isTimed(sch) });
    arr[i] = x;
    setEntries((h) => ({ ...h, [day]: { ...(h[day] ?? {}), [name]: arr } }));
    touch();
  }, [entries, day, P.session, touch]);

  /** Writes a whole set at once (session mode's Log set). */
  const writeSetFull = useCallback(async (name: string, sch: string, i: number, x: Set_) => {
    await db.writeSet(day, name, i + 1, { weight_kg: x.w ?? null, band_slot: x.b ?? null, reps: x.r ?? null, program_key: P.session, is_timed: isTimed(sch) });
    setEntries((h) => {
      const arr = (h[day]?.[name] ?? []).map((y) => ({ ...y }));
      while (arr.length <= i) arr.push({});
      arr[i] = x.w == null && x.r == null && x.b == null ? {} : x;
      while (arr.length && !(arr[arr.length - 1].w != null || arr[arr.length - 1].r != null || arr[arr.length - 1].b != null)) arr.pop();
      return { ...h, [day]: { ...(h[day] ?? {}), [name]: arr } };
    });
    touch();
  }, [day, P.session, touch]);

  const chooseSwap = useCallback(async (def: string, alt: string | null) => {
    if (!P.session) return;
    await db.setSwap(P.session, def, alt);
    await load(); touch();
  }, [P.session, load, touch]);

  const saveBands = useCallback(async (b: Band[]) => { await db.updateBands(b); await reloadAll(); }, [reloadAll]);
  const markTrained = useCallback(async () => { await db.setCheck(day, 'train', true); setTrainTick(true); touch(); }, [day, touch]);
  const saveDay = useCallback(async (f: db.DayFields) => { await db.saveDayFields(day, f); setLog((l) => ({ ...(l ?? ({} as db.DayLog)), ...f, date: day })); touch(); }, [day, touch]);

  return { engine, day, maxDay, P, list, swaps, entries, today, bands, log, trainTick, loaded, writeCell, writeSetFull, chooseSwap, saveBands, markTrained, saveDay, reload: load };
}
