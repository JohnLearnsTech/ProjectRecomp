import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Nudge } from '../../../components/Consistency';
import { Icon } from '../../../components/Icon';
import { Guides } from '../../../components/Guides';
import { Mini, useInfo } from '../../../components/ui';
import floors from '../../../domain/data/floors.json';
import { ScreenHeader } from '../../../components/ScreenHeader';
import mobPostJson from '../../../domain/data/mobPost.json';
import mobPreJson from '../../../domain/data/mobPre.json';
import { d, shortDate, trimNum } from '../../../domain/dates';
import {
  BAND_N, bandLabel, exDone, filled, isTimed, lastFor, lastSameSession, loadKind, progressHint, setCount, setTxt, volumeOf, ytHref,
  type Band, type Resolved,
} from '../../../domain/training';
import { useTraining } from '../../../lib/useTraining';
import { loadWarm, loadWo, saveWarm } from '../../../lib/workout';
import { font, useTheme } from '../../../lib/theme';

const MOB_PRE = mobPreJson as string[], MOB_POST = mobPostJson as string[];
const PRE_FOOT = 'Standing and chair only — nothing on the floor. Keep a hand on something solid.';
const POST_FOOT = 'If your torso blocks the fold, shorten the range and hold longer. Never force it against your own body mass.';

export default function Train() {
  const T = useTraining();
  const { engine, day, maxDay, P, list, today, entries, bands, log, trainTick } = T;
  const { c, s } = useTheme('train');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [swapFor, setSwapFor] = useState<Resolved | null>(null);
  const [warm, setWarm] = useState(loadWarm());
  const [note, setNote] = useState('');
  const [steps, setSteps] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setNote(log?.note ?? ''); setSteps(log?.steps != null ? String(log.steps) : ''); }, [log?.note, log?.steps, day]);

  const future = day > maxDay;
  const phaseName = engine.PL.phases[P.phase - 1]?.name.split('·').pop()?.trim();
  const head = !P.inRange ? (P.idx < 0 ? 'Before the start line' : engine.G.name ? engine.G.name + ': block complete' : 'Block complete')
    : P.type === 'lift' ? engine.NAMES[P.session!] : P.type === 'cardio' ? 'Cardio and steps' : 'Rest day';
  const wo = loadWo();
  const live = !!wo && wo.day === day && wo.session === P.session && !wo.done;
  // r19 renderWoStart: anything logged that day, not only this session's exercises.
  const anySets = Object.keys(entries[day]?.sets ?? {}).length > 0;
  const vol = volumeOf(P, engine.PL, T.swaps, today, bands);
  const prev = P.session ? lastSameSession(engine.plan, P.session, engine.PL, T.swaps, entries, engine.T.START, engine.T.TOTAL, day, bands) : null;
  const usesBands = list.some((R) => loadKind(R.name) === 'band');
  const run = (p: Promise<unknown>) => p.catch((e) => setErr((e as Error).message));
  const floorTip = useInfo('Today’s floor: ' + (P.inRange ? (floors as Record<string, string>)[P.type] : 'nothing yet. The plan starts on ' + shortDate(d(engine.T.START)) + '.'), 'Today’s floor');
  const [tips, setTips] = useState<Record<string, boolean>>({});
  const cardioTxt = P.type === 'lift' ? P.cardio.replace(/\s*after the session\s*/i, ' ').replace(/\s+/g, ' ').trim() : P.cardio;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={false} onRefresh={() => T.reload()} />}>
        <ScreenHeader title="Train" strip={false} dayLine={false} cat="train" />
        <Nudge />
        {err && <Text style={s.error}>{err}</Text>}

        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={[s.cardTitle, { flexShrink: 1 }]}>{head}</Text>{floorTip.button}</View>
              {P.inRange && <Text style={s.label}>Week {P.week} · Phase {P.phase} · {phaseName}</Text>}
            </View>
            <Mini label="Edit plan" onPress={() => { try { localStorage.setItem('recomp:metab', 'plan'); } catch { /* ignore */ } router.push('/me'); }} />
          </View>
          {floorTip.panel}
          {P.type === 'lift' && !future && (
            <>
              <Pressable style={s.primary} onPress={() => router.push('/session')} accessibilityRole="button">
                <Text style={s.primaryText}>▶  {live ? 'Resume session' : anySets ? 'Continue in session mode' : 'Start session'}</Text>
              </Pressable>
              <Text style={s.label}>One exercise at a time, with a rest timer, last time’s numbers and a suggested load.{trainTick ? ' This session is saved.' : ''}</Text>
            </>
          )}
          {P.type === 'lift' && (
            <Pressable onPress={() => { setWarm(!warm); saveWarm(!warm); }} accessibilityRole="switch" accessibilityState={{ checked: warm }}
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, minHeight: 32, backgroundColor: warm ? c.cat.train.soft : c.surface2, borderWidth: 1, borderColor: warm ? c.cat.train.soft : c.line }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: warm ? c.cat.train.fill : c.line }} />
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: warm ? c.cat.train.ink : c.ink2 }}>Warm-up & stretch</Text>
            </Pressable>
          )}
          {P.type === 'lift' && warm && <MobBlock title="Warm-up, 5 min" items={MOB_PRE} foot={PRE_FOOT} />}

          {P.type === 'lift' ? list.map((R) => {
            const cur = today[R.name] ?? [];
            const n = Math.max(setCount(R.sch), cur.length, extra[R.name] || 0);
            const done = exDone(cur, R.sch), timed = isTimed(R.sch), kind = loadKind(R.name);
            const isOpen = !!open[R.name];
            const lp = lastFor(R.name, entries, engine.T.START, engine.T.TOTAL, day);
            const hint = progressHint(R.name, R.sch, kind, lp, P.phase, bands);
            const summary = filled(cur).map((x) => setTxt(x, timed, bands)).join(', ');
            return (
              <View key={R.def} style={{ borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} onPress={() => setOpen((o) => ({ ...o, [R.name]: !isOpen }))}
                    accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={R.name}>
                    <Text style={[s.row16, { fontFamily: font.medium }]}>
                      {done ? <Text style={{ color: c.cat.train.ink }}>✓ </Text> : null}{R.name}
                      {R.swapped ? <Text style={{ color: c.cat.train.ink, fontSize: 12 }}>  swapped</Text> : null}
                    </Text>
                    <Text style={s.label}>{summary || R.sch}</Text>
                  </Pressable>
                  {R.pool.length > 0 && <Tool label={`Swap ${R.def}`} icon="swap" onPress={() => setSwapFor(R)} />}
                  {!!R.cue && <Tool label={`How to do ${R.name}`} glyph="i" on={tips[R.name]} onPress={() => setTips((o) => ({ ...o, [R.name]: !o[R.name] }))} />}
                  <Tool label={`Watch ${R.name} on YouTube`} icon="play" onPress={() => Linking.openURL(ytHref(R.name))} />
                </View>
                {tips[R.name] && !isOpen && !!R.cue && <Text style={[s.body2, { fontSize: 13.5, lineHeight: 20 }]}>{R.cue}</Text>}
                {isOpen && (
                  <View style={{ gap: 10 }}>
                    <Text style={s.body2}>
                      {R.sch}
                      {lp ? <Text> · Last <Text style={{ fontFamily: font.semibold, color: c.ink }}>{lp.sets.map((x) => setTxt(x, timed, bands)).join(', ')}</Text></Text> : null}
                      {hint ? <Text style={{ color: c.cat.move.ink, fontFamily: font.semibold }}> · {hint}</Text> : null}
                    </Text>
                    {R.cue ? <Text style={s.label}>{R.cue}</Text> : null}
                    <SetGrid n={n} kind={kind} timed={timed} cur={cur} bands={bands} disabled={future}
                      onChange={(i, fld, v) => run(T.writeCell(R.name, R.sch, i, fld, v))} />
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Pressable style={[s.outline, { minHeight: 40 }]} onPress={() => setExtra((o) => ({ ...o, [R.name]: n + 1 }))}><Text style={s.outlineText}>+ set</Text></Pressable>
                      {n > Math.max(setCount(R.sch), cur.length) && (
                        <Pressable style={[s.outline, { minHeight: 40 }]} onPress={() => setExtra((o) => ({ ...o, [R.name]: n - 1 }))}><Text style={s.outlineText}>− set</Text></Pressable>
                      )}
                      <Text style={s.label}>{n} sets</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          }) : (
            <Text style={s.body2}>
              {!P.inRange ? `Outside the ${engine.T.TOTAL}-day plan.` : P.type === 'rest' ? 'Recovery day. The stretch set is the whole reason a rest day is not a gap.' : 'Cardio and steps. Stretch afterwards, while you are still warm.'}
            </Text>
          )}

          {vol && (vol.sets > 0 || vol.out > 0) && (
            <Text style={s.body2}>
              {vol.kg > 0 ? <>Load volume <Text style={{ fontFamily: font.semibold, color: c.ink }}>{Math.round(vol.kg).toLocaleString('en-IN')} kg</Text>
                {prev ? `, ${pct(vol.kg, prev.v.kg)} on ${shortDate(d(prev.k))} (${Math.round(prev.v.kg).toLocaleString('en-IN')} kg)` : ''}.</>
                : 'Sets logged without a load (bodyweight, timed or unweighed bands) don’t count toward load volume.'}
            </Text>
          )}

          {P.inRange && (P.type !== 'lift' || warm) && <MobBlock title={P.type === 'lift' ? 'Stretch after, 8 min' : 'Stretch · 8 min'} items={MOB_POST} foot={POST_FOOT} startOpen={P.type !== 'lift'} />}

          {P.type === 'lift' && (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Session note</Text>
              <TextInput style={s.input} value={note} onChangeText={setNote} editable={!future} placeholder="Right knee felt tight on set 3, dropped the load"
                placeholderTextColor={c.muted} onBlur={() => note !== (log?.note ?? '') && run(T.saveDay({ note: note.trim() || null }))} />
            </View>
          )}
          {P.inRange && P.cardio ? (
            <View style={{ gap: 2 }}>
              <Text style={[s.label, { color: c.warn, fontFamily: font.semibold }]}>{P.type === 'lift' ? 'After the session' : 'Today'}</Text>
              <Text style={s.body}>{cardioTxt}</Text>
            </View>
          ) : null}
          {P.inRange && (
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Steps {day === maxDay ? 'today' : 'that day'}</Text>
              <TextInput style={s.input} value={steps} onChangeText={setSteps} editable={!future} keyboardType="number-pad" placeholder={String(P.steps)} placeholderTextColor={c.muted}
                onBlur={() => { const v = steps.trim() === '' ? null : Math.round(+steps); if (v !== (log?.steps ?? null) && (v == null || (v >= 0 && v <= 200000))) run(T.saveDay({ steps: v })); }} />
              <Text style={s.label}>Target <Text style={{ fontFamily: font.semibold, color: c.ink }}>{P.steps.toLocaleString('en-IN')}</Text>
                {+steps > 0 && +steps < P.steps ? ` · ${(P.steps - +steps).toLocaleString('en-IN')} to go` : ''}</Text>
            </View>
          )}
        </View>

        {usesBands && <BandSetup bands={bands} onSave={(b) => run(T.saveBands(b))} />}
        <Guides kind="train" />
        <Text style={[s.label, { marginTop: 8 }]}>Recomp is a training, nutrition and habits tool. Its targets come from standard formulas and your own logs; they are not medical advice.</Text>
      </ScrollView>

      {swapFor && (
        <Modal transparent animationType="slide" onRequestClose={() => setSwapFor(null)}>
          <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setSwapFor(null)} accessibilityLabel="Close" />
          <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 8 }}>
            <Text style={s.cardTitle}>Swap {swapFor.def}</Text>
            <Text style={s.label}>Same sets and reps. A swapped exercise keeps its own history.</Text>
            {[[null, `Keep: ${swapFor.def}`, ''] as const, ...swapFor.pool.filter((p) => p.split('|')[0] !== swapFor.def).map((p) => { const q = p.split('|'); return [q[0], q[0], q[2] ?? ''] as const; })].map(([v, label, muscles]) => {
              const on = v == null ? !swapFor.swapped : swapFor.swapped && swapFor.name === v;
              return (
                <Pressable key={label} onPress={() => { const R = swapFor; setSwapFor(null); run(T.chooseSwap(R.def, v)); }}
                  style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? c.cat.train.soft : c.surface2 }}>
                  <Text style={[s.body, { fontFamily: font.semibold }]}>{label}</Text>
                  {muscles ? <Text style={s.label}>{muscles}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const pct = (a: number, b: number) => { const p = Math.round(((a - b) / b) * 100); return p > 0 ? `up ${p}%` : p < 0 ? `down ${-p}%` : 'level'; };

function Tool({ label, glyph, icon, onPress, on }: { label: string; glyph?: string; icon?: string; onPress: () => void; on?: boolean }) {
  const { c } = useTheme('train');
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={4}
      style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: on ? c.cat.train.fill : c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      {icon ? <Icon name={icon} size={icon === 'play' ? 10 : 13} color={icon === 'play' ? c.cat.train.fill : c.ink2} />
        : <Text style={{ color: on ? c.cat.train.ink : c.ink2, fontSize: 12, fontFamily: font.semibold, fontStyle: 'italic' }}>{glyph}</Text>}
    </Pressable>
  );
}

function MobBlock({ title, items, foot, startOpen }: { title: string; items: string[]; foot: string; startOpen?: boolean }) {
  const { c, s } = useTheme('train');
  const [open, setOpen] = useState(!!startOpen);
  const [tips, setTips] = useState<Record<string, boolean>>({});
  const about = useInfo(foot, 'About this list');
  return (
    <View style={{ backgroundColor: c.surface2, borderRadius: 14, borderWidth: 1, borderColor: c.lineSoft }}>
      <Pressable onPress={() => setOpen(!open)} style={{ minHeight: 50, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ fontFamily: font.bold, fontSize: 12.5, color: c.ink }}>{title}</Text>{about.button}</View>
        <Text style={{ color: c.muted, fontSize: 16 }}>{open ? '–' : '+'}</Text>
      </Pressable>
      {!!about.panel && <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>{about.panel}</View>}
      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          {items.map((r, i) => { const q = r.split('|'); return (
            <View key={q[0]} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.lineSoft, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: c.ink }}>{q[0]}</Text>
                  <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: c.muted }}>{q[1]}</Text>
                </View>
                {!!q[2] && <Tool label={`How to do ${q[0]}`} glyph="i" on={tips[q[0]]} onPress={() => setTips((o) => ({ ...o, [q[0]]: !o[q[0]] }))} />}
                <Tool label={`Watch ${q[0]} on YouTube`} icon="play" onPress={() => Linking.openURL(ytHref(q[0]))} />
              </View>
              {tips[q[0]] && !!q[2] && <Text style={[s.body2, { fontSize: 13, lineHeight: 19 }]}>{q[2]}</Text>}
            </View>
          ); })}
        </View>
      )}
    </View>
  );
}

/** r19 set grid: one column per set, load on top (kg or band), reps or seconds below. */
function SetGrid({ n, kind, timed, cur, bands, disabled, onChange }: {
  n: number; kind: 'weight' | 'band' | 'body'; timed: boolean; cur: { w?: number | null; r?: number | null; b?: number | null }[]; bands: Band[]; disabled: boolean;
  onChange: (i: number, fld: 'w' | 'r' | 'b', v: number | null) => void;
}) {
  const { c, s } = useTheme('train');
  let carry: number | null = null;
  const cells = Array.from({ length: n }, (_, i) => {
    const st = cur[i] ?? {};
    if (st.w != null) carry = st.w;
    return { st, carry: st.w == null ? carry : null };
  });
  const parse = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={[s.label, { width: 40 }]} />
          {cells.map((_, i) => <Text key={i} style={[s.label, { width: 64, textAlign: 'center' }]}>S{i + 1}</Text>)}
        </View>
        {kind !== 'body' && (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Text style={[s.label, { width: 40 }]}>{kind === 'band' ? 'band' : 'kg'}</Text>
            {cells.map(({ st, carry }, i) => kind === 'weight' ? (
              <Cell key={i} value={st.w != null ? trimNum(st.w) : ''} placeholder={carry != null ? trimNum(carry) : 'kg'} disabled={disabled}
                label={`Set ${i + 1} weight in kg`} decimal onCommit={(v) => { const x = parse(v); if (x == null || (x >= 0 && x <= 500)) onChange(i, 'w', x); }} />
            ) : (
              <BandCell key={i} value={st.b ?? null} bands={bands} disabled={disabled} onChange={(b) => onChange(i, 'b', b)} label={`Set ${i + 1} band`} />
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Text style={[s.label, { width: 40 }]}>{timed ? 'sec' : 'reps'}</Text>
          {cells.map(({ st }, i) => (
            <Cell key={i} value={st.r != null ? trimNum(st.r) : ''} placeholder={timed ? 's' : '–'} disabled={disabled} label={`Set ${i + 1} ${timed ? 'seconds' : 'reps'}`}
              onCommit={(v) => { const x = parse(v); if (x == null || (x >= 0 && x <= 999)) onChange(i, 'r', x == null ? null : Math.round(x)); }} />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function Cell({ value, placeholder, onCommit, disabled, label, decimal }: { value: string; placeholder: string; onCommit: (v: string) => void; disabled: boolean; label: string; decimal?: boolean }) {
  const { c, s } = useTheme('train');
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <TextInput style={[s.input, { width: 64, minHeight: 44, paddingHorizontal: 6, textAlign: 'center' }]} value={v} onChangeText={setV} editable={!disabled}
      onBlur={() => v !== value && onCommit(v)} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} placeholder={placeholder} placeholderTextColor={c.muted}
      accessibilityLabel={label} selectTextOnFocus />
  );
}

function BandCell({ value, bands, onChange, disabled, label }: { value: number | null; bands: Band[]; onChange: (b: number | null) => void; disabled: boolean; label: string }) {
  const { c, s } = useTheme('train');
  // Tap cycles: none, band 1 .. band 5, none.
  const next = value == null ? 1 : value >= BAND_N ? null : value + 1;
  return (
    <Pressable disabled={disabled} onPress={() => onChange(next)} accessibilityLabel={`${label}: ${value ? bandLabel(bands, value) : 'none'}. Tap for the next band`}
      style={[s.input, { width: 64, minHeight: 44, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontFamily: font.medium, fontSize: 12, color: value ? c.ink : c.muted, textAlign: 'center' }} numberOfLines={2}>{value ? bands[value - 1]?.n ?? `Band ${value}` : '–'}</Text>
    </Pressable>
  );
}

function BandSetup({ bands, onSave }: { bands: Band[]; onSave: (b: Band[]) => void }) {
  const { c, s } = useTheme('train');
  const [open, setOpen] = useState(false);
  const [b, setB] = useState(bands.map((x) => ({ n: x.n, kg: x.kg == null ? '' : String(x.kg) })));
  useEffect(() => setB(bands.map((x) => ({ n: x.n, kg: x.kg == null ? '' : String(x.kg) }))), [bands]);
  return (
    <View style={s.card}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }} accessibilityState={{ expanded: open }}>
        <Text style={s.section}>Your bands</Text>
        <Text style={{ color: c.muted, fontSize: 18 }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={s.label}>Lightest first. Band colours mean different things in different brands, so name them to match your set. The kg is only used for load volume.</Text>
          {b.map((x, i) => (
            <View key={i} style={s.row}>
              <TextInput style={[s.input, { flex: 2 }]} value={x.n} onChangeText={(v) => setB((o) => o.map((y, j) => (j === i ? { ...y, n: v.slice(0, 16) } : y)))} accessibilityLabel={`Band ${i + 1} name`} />
              <TextInput style={[s.input, { flex: 1 }]} value={x.kg} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={c.muted}
                onChangeText={(v) => setB((o) => o.map((y, j) => (j === i ? { ...y, kg: v } : y)))} accessibilityLabel={`Band ${i + 1} kg`} />
            </View>
          ))}
          <Pressable style={s.outline} onPress={() => onSave(b.map((x, i) => ({ n: x.n.trim() || `Band ${i + 1}`, kg: x.kg.trim() === '' || !(+x.kg > 0) ? null : +x.kg })))}>
            <Text style={s.outlineText}>Save bands</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
