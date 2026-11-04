import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { d, shortDate, trimNum } from '../../domain/dates';
import {
  BAND_N, bandLabel, bestBefore, bestToday, exDone, filled, fmtDur, isTimed, lastFor, lastSameSession, loadKind, prText, setCount, setTxt,
  stepFor, volumeOf, woSuggest, ytHref, type Set_,
} from '../../domain/training';
import { useTraining } from '../../lib/useTraining';
import { loadRestLen, loadWo, saveRestLen, saveWo, type Wo } from '../../lib/workout';
import { font, useTheme } from '../../lib/theme';

// r19 session mode (05-business-logic §8): one exercise at a time with a rest timer, last
// time's numbers and a suggested load. State lives on the device; minimising keeps it.
// The rest countdown is kept outside the component so it survives minimise and reopen.
const rest = { end: 0, alerted: false };

export default function Session() {
  useKeepAwake();
  const T = useTraining();
  const { engine, day, maxDay, P, list, today, entries, bands, loaded } = T;
  const { c, s } = useTheme('train');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [wo, setWoState] = useState<Wo | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [restLen, setRestLen] = useState(loadRestLen());
  const [now, setNow] = useState(Date.now());
  const [cueOpen, setCueOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setWo = (w: Wo) => { setWoState(w); saveWo(w); };

  // openWorkout(): resume today's session, or start one at the first unfinished exercise.
  useEffect(() => {
    if (!loaded || wo) return;
    if (P.type !== 'lift' || !P.session || day > maxDay) { router.back(); return; }
    const stored = loadWo();
    if (stored && stored.day === day && stored.session === P.session && !stored.done) { setWoState(stored); return; }
    const first = list.findIndex((R) => !exDone(today[R.name] ?? [], R.sch));
    setWo({ day, session: P.session, start: Date.now(), idx: first < 0 ? 0 : first });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // 250 ms tick for the clock and rest; buzz once when the rest runs out.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now(); setNow(n);
      if (rest.end && !rest.alerted && n >= rest.end) { rest.alerted = true; Vibration.vibrate([0, 180, 90, 180]); }
      if (rest.end && n - rest.end > 60000) rest.end = 0;
    }, 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } }, [toast]);

  const L = list;
  const idx = wo ? wo.idx : 0;
  const summary = !!wo && idx >= L.length;
  const R = !summary ? L[Math.max(0, Math.min(L.length - 1, idx))] : null;
  const cur: Set_[] = R ? today[R.name] ?? [] : [];
  const n = R ? Math.max(setCount(R.sch), cur.length, extra[R.name] || 0) : 0;
  let next = n; for (let j = 0; j < n; j++) if (!(cur[j] && cur[j].r != null)) { next = j; break; }
  const ei = sel != null ? sel : Math.min(next, n - 1);
  const allIn = next >= n && sel == null;
  const kind = R ? loadKind(R.name) : 'weight';
  const timed = R ? isTimed(R.sch) : false;
  const lp = R ? lastFor(R.name, entries, engine.T.START, engine.T.TOTAL, day) : null;
  const sug = R ? woSuggest(R.name, R.sch, kind, lp, P.phase, bands) : null;

  // Editor prefill: this set's values, else the previous set's load, else the suggestion.
  const pre = useMemo(() => {
    if (!R || !sug) return { w: '', b: 1, r: '' };
    const have = cur[ei] ?? {};
    let prevLoad: Set_ | null = null;
    for (let j = ei - 1; j >= 0; j--) { const x = cur[j]; if (x && (x.w != null || x.b != null)) { prevLoad = x; break; } }
    const w0 = have.w != null ? have.w : prevLoad?.w != null ? prevLoad.w : sug.w;
    const b0 = have.b != null ? have.b : prevLoad?.b != null ? prevLoad.b : sug.b || 1;
    const r0 = have.r != null ? have.r : sug.r;
    return { w: w0 != null ? trimNum(w0) : '', b: b0, r: r0 != null ? String(r0) : '' };
  }, [R?.name, ei, JSON.stringify(cur), sug?.msg]); // eslint-disable-line react-hooks/exhaustive-deps
  const [w, setW] = useState(''); const [b, setB] = useState(1); const [r, setR] = useState('');
  useEffect(() => { setW(pre.w); setB(pre.b); setR(pre.r); }, [pre]);

  const go = (i: number) => { if (!wo) return; setWo({ ...wo, idx: i }); setSel(null); setCueOpen(false); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const step = (v: string, delta: number) => { const x = parseFloat(v); return trimNum(Math.max(0, (Number.isFinite(x) ? x : 0) + delta)); };

  const log = async () => {
    if (!R || day > maxDay) return;
    const reps = parseInt(r, 10);
    if (!(reps > 0)) { setToast(timed ? 'Enter the seconds held' : 'Enter the reps'); return; }
    const before = bestBefore(R.name, kind, entries, day), todayBest = bestToday(R.name, kind, cur);
    const x: Set_ = { r: reps };
    if (kind === 'weight') { const wv = parseFloat(w); if (Number.isFinite(wv) && wv > 0) x.w = wv; }
    if (kind === 'band') x.b = b || 1;
    setBusy(true);
    try {
      await T.writeSetFull(R.name, R.sch, ei, x);
      const nowBest = bestToday(R.name, kind, Object.assign([...cur], { [ei]: x }));
      if (before != null && nowBest != null && nowBest > before && (todayBest == null || nowBest > todayBest)) {
        Vibration.vibrate(60); setToast('New best: ' + prText(R.name, kind, nowBest, bands));
      }
      setSel(null); rest.end = Date.now() + restLen * 1000; rest.alerted = false;
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
  };
  const clear = async () => { if (!R) return; setBusy(true); try { await T.writeSetFull(R.name, R.sch, ei, {}); setSel(null); } finally { setBusy(false); } };
  const done = async () => {
    setBusy(true);
    try { await T.markTrained(); if (wo) setWo({ ...wo, done: true }); rest.end = 0; router.back(); }
    catch (e) { setToast((e as Error).message); setBusy(false); }
  };

  if (!wo || !loaded) return <View style={{ flex: 1, backgroundColor: c.paper }} />;
  const remain = rest.end ? rest.end - now : 0;
  const name = engine.NAMES[P.session!] || 'Session';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Minimise, the session keeps running" hitSlop={6}
          style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: c.ink }}>⌄</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.section, { fontFamily: font.bold }]}>{name}</Text>
          <Text style={[s.body2, s.num]}>{fmtDur(now - wo.start)}</Text>
        </View>
        {!summary && <Pressable style={[s.outline, { borderRadius: 999 }]} onPress={() => go(L.length)}><Text style={s.outlineText}>Finish</Text></Pressable>}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingVertical: 10 }} accessibilityElementsHidden>
        {L.map((X, i) => (
          <View key={X.def} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: exDone(today[X.name] ?? [], X.sch) ? c.cat.train.fill : c.lineSoft,
            borderWidth: i === idx ? 1.5 : 0, borderColor: c.ink }} />
        ))}
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
        {toast && <View style={{ backgroundColor: c.cat.train.soft, borderRadius: 12, padding: 12 }}><Text style={[s.body, { fontFamily: font.semibold }]}>{toast}</Text></View>}

        {summary ? (
          <Summary />
        ) : R && sug && (
          <>
            <View style={{ gap: 4 }}>
              <Text style={s.label}>Exercise {idx + 1} of {L.length}</Text>
              <Text style={{ fontFamily: font.bold, fontSize: 30, lineHeight: 34, color: c.ink }}>{R.name}</Text>
              <Text style={[s.body2, { fontSize: 17 }]}>{R.sch}</Text>
            </View>
            <Pressable onPress={() => Linking.openURL(ytHref(R.name))} style={[s.outline, { alignSelf: 'flex-start', flexDirection: 'row', gap: 8 }]}>
              <Text style={{ color: c.danger }}>▶</Text><Text style={s.outlineText}>Watch how on YouTube</Text>
            </Pressable>
            {lp && <Text style={s.body2}>Last time ({shortDate(d(lp.k))}): <Text style={{ fontFamily: font.semibold, color: c.ink }}>{lp.sets.map((x) => setTxt(x, timed, bands)).join(', ')}</Text></Text>}
            <View style={{ backgroundColor: c.cat.move.soft, borderRadius: 14, padding: 14 }}><Text style={s.body}>{sug.msg}</Text></View>
            {R.cue ? (
              <Pressable onPress={() => setCueOpen(!cueOpen)} accessibilityState={{ expanded: cueOpen }}>
                <Text style={[s.body, { fontFamily: font.semibold, color: c.ink2 }]}>{cueOpen ? '▾' : '▸'} How to do it</Text>
                {cueOpen && <Text style={[s.body2, { marginTop: 6 }]}>{R.cue}</Text>}
              </Pressable>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel="Sets">
              {Array.from({ length: n }, (_, i) => {
                const st = cur[i], isDone = !!st && st.r != null, isSel = i === ei && !allIn;
                return (
                  <Pressable key={i} onPress={() => setSel(i === next && sel == null ? null : i)} accessibilityState={{ selected: isSel }}
                    style={{ width: '31%', minHeight: 64, borderRadius: 14, padding: 10, backgroundColor: isDone ? c.cat.train.soft : c.surface,
                      borderWidth: isSel ? 2 : 0, borderColor: c.ink }}>
                    <Text style={s.label}>Set {i + 1}{isDone ? ' ✓' : ''}</Text>
                    <Text style={[s.body, { fontFamily: font.semibold }]}>{isDone ? setTxt(st, timed, bands) : '–'}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => { setExtra((o) => ({ ...o, [R.name]: n + 1 })); setSel(n); }}
                style={{ width: '31%', minHeight: 64, borderRadius: 14, padding: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line }}>
                <Text style={s.label}>Add</Text><Text style={[s.body, { fontFamily: font.semibold }]}>+ set</Text>
              </Pressable>
            </View>

            {rest.end > 0 && remain > -60000 && (
              <View style={{ backgroundColor: remain > 0 ? c.surface : c.cat.train.soft, borderRadius: 16, padding: 16, gap: 10 }}>
                <Text style={s.label}>{remain > 0 ? 'Rest' : 'Rest over. Next set.'}</Text>
                <Text style={{ fontFamily: font.bold, fontSize: 40, color: c.ink, fontVariant: ['tabular-nums'] }}>{remain > 0 ? fmtDur(remain + 999) : '0:00'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[60, 90, 120, 180].map((sx) => (
                    <Pill key={sx} on={restLen === sx} label={sx < 120 ? `${sx} s` : `${sx / 60} min`} onPress={() => {
                      setRestLen(sx); saveRestLen(sx); if (rest.end > Date.now()) rest.end = Date.now() + sx * 1000;
                    }} />
                  ))}
                  <Pill label="+15 s" onPress={() => { rest.end = Math.max(rest.end, Date.now()) + 15000; rest.alerted = false; setNow(Date.now()); }} />
                  <Pill label="Skip" onPress={() => { rest.end = 0; setNow(Date.now()); }} />
                </View>
              </View>
            )}

            <View style={[s.card, { gap: 12 }]}>
              {allIn ? (
                <>
                  <Text style={[s.body, { fontFamily: font.semibold }]}>All {n} sets logged</Text>
                  <Text style={s.label}>Tap a set above to change it, or add one more.</Text>
                </>
              ) : (
                <>
                  <Text style={[s.label, { fontFamily: font.semibold }]}>Set {ei + 1} of {n}</Text>
                  {kind === 'weight' && <Stepper value={w} onChange={setW} unit="kg" decimal placeholder="kg"
                    onDec={() => setW((v) => step(v, -stepFor(R.name)))} onInc={() => setW((v) => step(v, stepFor(R.name)))} label="Weight in kg" />}
                  {kind === 'band' && <Stepper value={bandLabel(bands, b)} unit="band" readOnly
                    onDec={() => setB((v) => Math.max(1, v - 1))} onInc={() => setB((v) => Math.min(BAND_N, v + 1))} label="Band" />}
                  <Stepper value={r} onChange={setR} unit={timed ? 'sec' : 'reps'} onDec={() => setR((v) => step(v, -1))} onInc={() => setR((v) => step(v, 1))}
                    label={timed ? 'Seconds' : 'Reps'} />
                  <Pressable style={[s.primary, busy && { opacity: 0.5 }]} disabled={busy} onPress={log}>
                    <Text style={s.primaryText}>✓  {cur[ei]?.r != null ? `Update set ${ei + 1}` : `Log set ${ei + 1}`}</Text>
                  </Pressable>
                  {cur[ei]?.r != null && <Pressable onPress={clear} style={[s.outline, { alignSelf: 'flex-start' }]}><Text style={s.outlineText}>Clear this set</Text></Pressable>}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {!summary && R && (
        <View style={{ flexDirection: 'row', gap: 10, padding: 20, paddingTop: 8 }}>
          <Pressable style={[s.outline, { flex: 1, minHeight: 56 }, idx === 0 && { opacity: 0.4 }]} disabled={idx === 0} onPress={() => go(idx - 1)}><Text style={s.outlineText}>‹ Back</Text></Pressable>
          <Pressable style={[exDone(cur, R.sch) ? s.primary : s.outline, { flex: 1, minHeight: 56 }]} onPress={() => go(idx + 1)}>
            <Text style={exDone(cur, R.sch) ? s.primaryText : s.outlineText}>{idx >= L.length - 1 ? 'Finish ›' : 'Next exercise ›'}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );

  function Summary() {
    const v = volumeOf(P, engine.PL, T.swaps, today, bands);
    const prev = lastSameSession(engine.plan, P.session!, engine.PL, T.swaps, entries, engine.T.START, engine.T.TOTAL, day, bands);
    let sets = 0, exN = 0; const prs: string[] = [];
    L.forEach((X) => {
      const arr = filled(today[X.name] ?? []).filter((x) => x.r != null);
      sets += arr.length; if (arr.length) exN++;
      const k = loadKind(X.name), bb = bestBefore(X.name, k, entries, day), tb = bestToday(X.name, k, today[X.name] ?? []);
      if (bb != null && tb != null && tb > bb) prs.push(prText(X.name, k, tb, bands));
    });
    return (
      <View style={{ gap: 14 }}>
        <Text style={s.label}>Session done</Text>
        <Text style={{ fontFamily: font.bold, fontSize: 30, color: c.ink }}>{name}</Text>
        <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between' }]}>
          {[['Time', fmtDur(now - wo!.start)], ['Sets', String(sets)], ['Exercises', `${exN}/${L.length}`]].map(([k, val]) => (
            <View key={k}><Text style={s.label}>{k}</Text><Text style={s.stat}>{val}</Text></View>
          ))}
        </View>
        {v && v.kg > 0 && (
          <Text style={s.body}>Load volume <Text style={{ fontFamily: font.bold }}>{Math.round(v.kg).toLocaleString('en-IN')} kg</Text>
            {prev ? (() => { const pc = Math.round(((v.kg - prev.v.kg) / prev.v.kg) * 100); return `, ${pc > 0 ? 'up ' + pc + '%' : pc < 0 ? 'down ' + -pc + '%' : 'level'} on last time (${Math.round(prev.v.kg).toLocaleString('en-IN')} kg)`; })() : ''}.</Text>
        )}
        {prs.length > 0 && (
          <View style={{ gap: 4 }}>
            <Text style={s.label}>New bests</Text>
            {prs.map((p) => <Text key={p} style={[s.body, { fontFamily: font.semibold }]}>• {p}</Text>)}
          </View>
        )}
        {!sets && <Text style={s.body2}>Nothing logged yet. Go back and log a set, or close this and come back later.</Text>}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable style={[s.outline, { flex: 1, minHeight: 56 }]} onPress={() => go(0)}><Text style={s.outlineText}>‹ Back to exercises</Text></Pressable>
          {sets ? (
            <Pressable style={[s.primary, { flex: 1, minHeight: 56 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={done}><Text style={s.primaryText}>Save and close</Text></Pressable>
          ) : (
            <Pressable style={[s.outline, { flex: 1, minHeight: 56 }]} onPress={() => router.back()}><Text style={s.outlineText}>Close</Text></Pressable>
          )}
        </View>
      </View>
    );
  }
}

function Pill({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const { c } = useTheme('train');
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: !!on }}
      style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? c.ink : c.surface2 }}>
      <Text style={{ fontFamily: font.medium, color: on ? c.paper : c.ink2 }}>{label}</Text>
    </Pressable>
  );
}

function Stepper({ value, onChange, unit, onDec, onInc, label, decimal, placeholder, readOnly }: {
  value: string; onChange?: (v: string) => void; unit: string; onDec: () => void; onInc: () => void; label: string; decimal?: boolean; placeholder?: string; readOnly?: boolean;
}) {
  const { c, s } = useTheme('train');
  const btn = (g: string, f: () => void, l: string) => (
    <Pressable onPress={f} accessibilityLabel={l} style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 26, color: c.ink, fontFamily: font.semibold }}>{g}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('−', onDec, `Less ${label.toLowerCase()}`)}
      {readOnly ? (
        <View style={[s.input, { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' }]}><Text style={[s.body, { fontFamily: font.semibold }]} numberOfLines={1}>{value}</Text></View>
      ) : (
        <TextInput style={[s.input, { flex: 1, minHeight: 56, textAlign: 'center', fontSize: 24, fontFamily: font.bold }]} value={value} onChangeText={onChange}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'} placeholder={placeholder} placeholderTextColor={c.muted} accessibilityLabel={label} selectTextOnFocus />
      )}
      {btn('+', onInc, `More ${label.toLowerCase()}`)}
      <Text style={[s.label, { width: 36 }]}>{unit}</Text>
    </View>
  );
}
