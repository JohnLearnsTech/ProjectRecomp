import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { ReviewCard } from '../../../components/Review';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { addDays, d, diffDays, fmt, key, shortDate, trimNum, WEEKDAY_NAMES } from '../../../domain/dates';
import { waistWeekday } from '../../../domain/plan';
import * as db from '../../../lib/db';
import { useDays } from '../../../lib/days';
import { useRecomp } from '../../../lib/recomp';
import { font, useTheme, type Palette } from '../../../lib/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Progress() {
  const { at } = useLocalSearchParams<{ at?: string }>();
  const { c, s } = useTheme('body');
  const { reload } = useRecomp();
  const { reload: reloadDays } = useDays();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [calY, setCalY] = useState<number | null>(null);
  useEffect(() => { if (at === 'cal' && calY != null) { scroll.current?.scrollTo({ y: calY - 12, animated: true }); router.setParams({ at: undefined }); } }, [at, calY]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView ref={scroll} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); reloadDays(); }} />}>
        <ScreenHeader title="Progress" strip={false} dayLine={false} cat="body" />
        <WeightChart />
        <Stats />
        <WeighIn />
        <View onLayout={(e) => setCalY(e.nativeEvent.layout.y)}><ConsistencyFull /></View>
        <VolumeChart />
        <ReviewCard />
        <DailyLog />
        <Text style={[s.label, { marginTop: 8 }]}>Recomp is a training, nutrition and habits tool. Its targets come from standard formulas and your own logs; they are not medical advice.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Segmented({ items, value, onChange, small, c }: { items: [string, string][]; value: string; onChange: (v: string) => void; small?: boolean; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map(([id, label]) => {
        const on = id === value;
        return (
          <Pressable key={id} onPress={() => onChange(id)} accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: 14, minHeight: small ? 36 : 40, justifyContent: 'center', borderRadius: 999, backgroundColor: on ? (small ? c.cat.body.soft : c.ink) : c.surface2 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: on ? (small ? c.cat.body.ink : c.paper) : c.ink2 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** r19 renderChart: weight (with the dashed plan line) or waist, over a trailing range. */
function WeightChart() {
  const { engine, maxDay } = useRecomp();
  const { D } = useDays();
  const { c, s } = useTheme('body');
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState<'weight' | 'waist'>('weight');
  const [range, setRange] = useState(30);
  const { START, TOTAL, TARGET_KG } = engine.T;
  const isW = metric === 'weight';
  const tIdx = Math.max(0, Math.min(TOTAL - 1, diffDays(d(START), d(maxDay))));
  let i0: number, i1: number;
  if (range > 0) { i1 = tIdx; i0 = Math.max(0, tIdx - range + 1); if (i1 - i0 < 2) i1 = Math.min(TOTAL - 1, i0 + 2); } else { i0 = 0; i1 = TOTAL - 1; }
  const span = Math.max(1, i1 - i0);
  const sr = D.series();
  const val: (number | null)[] = new Array(TOTAL).fill(null);
  if (isW) sr.forEach((x, i) => { val[i] = x.w; });
  else D.waistSeries().forEach((x) => { const idx = diffDays(d(START), d(x.k)); if (idx >= 0 && idx < TOTAL) val[idx] = x.v; });
  const ys: number[] = [];
  for (let i = i0; i <= i1; i++) { if (isW) ys.push(D.projFor(i)); if (val[i] != null) ys.push(val[i]!); }
  if (ys.length < 2) { const m = ys.length ? ys[0] : isW ? engine.T.START_KG : 0; ys.splice(0, ys.length, m - 2, m + 2); }
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(0.4, (hi - lo) * 0.16), yMin = lo - pad, yMax = hi + pad;
  const W = width - 40 - 36, H = 230, mL = 38, mR = 12, mT = 12, mB = 26, iw = W - mL - mR, ih = H - mT - mB;
  const X = (i: number) => mL + ((i - i0) / span) * iw, Y = (v: number) => mT + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const raw = (yMax - yMin) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const stepY = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? mag * 10, dec = stepY < 1 ? 1 : 0;
  const grid: number[] = []; for (let v = Math.ceil(yMin / stepY) * stepY; v <= yMax; v += stepY) grid.push(v);
  const pts = []; for (let i = i0; i <= i1; i++) if (val[i] != null) pts.push({ i, v: val[i]! });
  const last = pts[pts.length - 1];
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{isW ? 'Weight vs plan' : 'Waist'}</Text>
      <Segmented c={c} items={[['weight', 'Weight'], ['waist', 'Waist']]} value={metric} onChange={(v) => setMetric(v as 'weight' | 'waist')} />
      <Segmented c={c} small items={[['7', '1W'], ['30', '1M'], ['90', '3M'], ['0', 'Goal']]} value={String(range)} onChange={(v) => setRange(+v)} />
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Text style={s.label}><Text style={{ color: c.cat.body.fill }}>━ </Text>{isW ? 'Your weight' : 'Waist at the navel'}</Text>
        {isW && <Text style={s.label}><Text style={{ color: c.muted }}>┅ </Text>Projection</Text>}
      </View>
      <Svg width={W} height={H}>
        {grid.map((v) => (
          <G key={v}>
            <Line x1={mL} x2={W - mR} y1={Y(v)} y2={Y(v)} stroke={c.lineSoft} strokeWidth={1} />
            <SvgText x={mL - 6} y={Y(v) + 4} fontSize={10} fill={c.muted} textAnchor="end" fontFamily={font.regular}>{v.toFixed(dec)}</SvgText>
          </G>
        ))}
        {[i0, i1].map((i, n) => (
          <SvgText key={n} x={X(i)} y={H - 6} fontSize={10} fill={c.muted} textAnchor={n === 0 ? 'start' : 'end'} fontFamily={font.regular}>{shortDate(addDays(d(START), i))}</SvgText>
        ))}
        {isW && <Polyline points={Array.from({ length: i1 - i0 + 1 }, (_, j) => `${X(i0 + j)},${Y(D.projFor(i0 + j))}`).join(' ')} fill="none" stroke={c.muted} strokeWidth={2} strokeDasharray="5 5" opacity={0.6} />}
        {isW && tIdx >= i0 && tIdx <= i1 && <Circle cx={X(tIdx)} cy={Y(D.projFor(tIdx))} r={4} fill={c.surface} stroke={c.muted} strokeWidth={2} />}
        {pts.length > 1 && <Polyline points={pts.map((p) => `${X(p.i)},${Y(p.v)}`).join(' ')} fill="none" stroke={c.cat.body.fill} strokeWidth={2.5} strokeLinejoin="round" />}
        {pts.map((p) => <Circle key={p.i} cx={X(p.i)} cy={Y(p.v)} r={3} fill={c.cat.body.fill} />)}
        {last && <SvgText x={Math.min(X(last.i), W - mR - 2)} y={Y(last.v) - 9} fontSize={11} fontWeight="bold" fill={c.ink} textAnchor="end" fontFamily={font.bold}>{trimNum(last.v)}</SvgText>}
      </Svg>
      <Text style={s.body2}>
        {isW
          ? <>The dashed line is the plan: faster for the first fortnight (mostly water and glycogen), then steady{(engine.G.type || 'lose') === 'lose' ? ', with one flat maintenance week' : ''}. A landing between <Text style={{ fontFamily: font.bold, color: c.ink }}>{trimNum(TARGET_KG - 1.5)} and {trimNum(TARGET_KG + 3.5)} kg</Text> is the honest range.</>
          : `Measured every ${WEEKDAY_NAMES[waistWeekday(engine.PROFILE)]} at the navel. ${D.waistSeries().length > 1 ? 'Waist often keeps moving on the weeks the scale sits still. That is the whole reason to track it.' : 'Once there are two readings this draws a line you can follow.'}`}
      </Text>
    </View>
  );
}

function Stats() {
  const { day } = useRecomp();
  const { D, loaded } = useDays();
  const { c, s } = useTheme('body');
  const { engine } = useRecomp();
  if (!loaded) return null;
  const st = D.stats(day);
  const cells: [string, string | null, string][] = [
    ['Latest weight', st.latest != null ? `${st.latest.toFixed(1)} kg` : null, st.latestDay ? shortDate(d(st.latestDay)) : 'log it below'],
    ['7-day average', st.avg != null ? `${st.avg.toFixed(1)} kg` : null, st.avg != null ? 'the only number that counts' : 'needs 2+ entries in 7 days'],
    [`Change from ${trimNum(engine.T.START_KG)}`, st.delta != null ? `${st.delta > 0 ? '+' : ''}${st.delta.toFixed(1)} kg` : null, `since ${shortDate(d(engine.T.START))}`],
    ['On-plan target today', `${st.proj.toFixed(1)} kg`, st.projNote],
    ['At your current rate', st.rate.value, st.rate.note],
    ['Days logged', String(st.loggedDays), `of ${st.total} days`],
  ];
  return (
    <View style={[s.card, { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }]}>
      {cells.map(([k, v, n]) => (
        <View key={k} style={{ width: '50%', paddingRight: 10, gap: 2 }}>
          <Text style={s.label}>{k}</Text>
          <Text style={[s.stat, v == null && { color: c.muted }]}>{v ?? '—'}</Text>
          <Text style={s.label}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

/** "What you measured" for the browsed day. */
function WeighIn() {
  const { engine, day, maxDay, touch } = useRecomp();
  const { entries } = useDays();
  const { c, s } = useTheme('body');
  const e = entries[day] ?? {};
  const P = engine.plan(day), future = day > maxDay;
  const [w, setW] = useState(''); const [sl, setSl] = useState(''); const [wa, setWa] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setW(e.w != null ? String(e.w) : ''); setSl(e.sleep != null ? String(e.sleep) : ''); setWa(e.waist != null ? String(e.waist) : ''); setMsg(null); }, [day, e.w, e.sleep, e.waist]);
  const num = (x: string) => (x.trim() === '' ? null : Number(x.replace(',', '.')));
  const save = async () => {
    const f: db.DayFields = { weight_kg: num(w), sleep_h: num(sl) };
    if (P.waistDay) f.waist_cm = num(wa);
    if ((f.weight_kg != null && !(f.weight_kg > 20 && f.weight_kg < 400)) || (f.sleep_h != null && !(f.sleep_h >= 0 && f.sleep_h <= 24)) || (f.waist_cm != null && !(f.waist_cm >= 40 && f.waist_cm <= 250))) return setMsg('One of those numbers looks off.');
    try { await db.saveDayFields(day, f); touch(); setMsg('Saved.'); } catch (x) { setMsg((x as Error).message); }
  };
  const head = !P.inRange ? 'Outside the plan' : P.type === 'lift' ? engine.NAMES[P.session!] : P.type === 'cardio' ? 'Cardio and steps' : 'Rest day';
  return (
    <View style={s.card}>
      <Text style={s.label}>{fmt(d(day))}</Text>
      <Text style={s.cardTitle}>{head}</Text>
      {P.inRange && <Text style={s.label}>Day {diffDays(d(engine.T.START), d(day)) + 1} of {engine.T.TOTAL} · Week {P.week} · Phase {P.phase}</Text>}
      <Text style={[s.label, { fontFamily: font.semibold, marginTop: 4 }]}>What you measured</Text>
      <View style={s.row}>
        <Field label="Weight (kg)" value={w} onChange={setW} disabled={future} c={c} />
        <Field label="Sleep (h)" value={sl} onChange={setSl} disabled={future} c={c} />
        {P.waistDay && <Field label="Waist (cm)" value={wa} onChange={setWa} disabled={future} c={c} />}
      </View>
      <Pressable style={[s.primary, future && { opacity: 0.5 }]} disabled={future} onPress={save}>
        <Text style={s.primaryText}>{future ? 'Preview only' : day === maxDay ? 'Save today' : `Save ${shortDate(d(day))}`}</Text>
      </Pressable>
      {msg && <Text style={s.label}>{msg}</Text>}
    </View>
  );
}
function Field({ label, value, onChange, disabled, c }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean; c: Palette }) {
  const { s } = useTheme('body');
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange} editable={!disabled} keyboardType="decimal-pad" placeholderTextColor={c.muted} accessibilityLabel={label} />
    </View>
  );
}

const CAL_CLS = (c: Palette): Record<string, { bg: string; fg: string; border?: string }> => ({
  'k-full': { bg: c.cat.move.fill, fg: c.cat.move.on }, 'k-most': { bg: c.cat.move.fill + '8c', fg: c.ink }, 'k-some': { bg: c.cat.move.fill + '33', fg: c.ink },
  'k-none': { bg: c.warnSoft, fg: c.warn }, 'k-empty': { bg: 'transparent', fg: c.ink2, border: c.line }, 'k-pend': { bg: 'transparent', fg: c.ink, border: c.ink2 },
  'k-met': { bg: c.cat.move.fill, fg: c.cat.move.on }, 'k-miss': { bg: c.warnSoft, fg: c.warn }, 'k-over': { bg: c.dangerSoft, fg: c.danger },
  'k-rest': { bg: c.surface2, fg: c.muted }, future: { bg: 'transparent', fg: c.muted }, out: { bg: 'transparent', fg: c.line },
});
const LEG: Record<string, [string, string][]> = {
  overall: [['k-full', 'All done'], ['k-most', 'Half or more'], ['k-some', 'Under half'], ['k-none', 'None done'], ['k-empty', 'Nothing logged']],
  build: [['k-met', 'Hit the goal'], ['k-miss', 'Missed'], ['k-empty', 'Not logged']], limit: [['k-met', 'Stayed under'], ['k-over', 'Went over'], ['k-empty', 'Not logged']],
  food: [['k-met', 'Logged'], ['k-empty', 'Not logged']], workout: [['k-met', 'Trained'], ['k-miss', 'Skipped'], ['k-rest', 'No lift scheduled']],
};

/** r19 renderCalendar: stats, filter chips, one month at a time, and the selected day item by item. */
function ConsistencyFull() {
  const { engine, maxDay, day, setDay } = useRecomp();
  const { D, habits, loaded } = useDays();
  const { c, s } = useTheme('body');
  const { START, END } = engine.T;
  const monthKey = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const clamp = (mk: string) => { const lo = monthKey(d(START)), hi = monthKey(d(END)); return mk < lo ? lo : mk > hi ? hi : mk; };
  const [month, setMonth] = useState(() => clamp(monthKey(d(day))));
  const [filter, setFilter] = useState<string>(() => { try { return localStorage.getItem('goa:calf') || 'overall'; } catch { return 'overall'; } });
  const [sel, setSel] = useState(maxDay);
  const shift = (n: number) => setMonth((m) => { const dt = d(m); return clamp(monthKey(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + n, 1)))); });
  const shiftRef = useRef(shift); shiftRef.current = shift;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 45) shiftRef.current(g.dx < 0 ? 1 : -1); },
  })).current;
  if (!loaded) return null;
  const items = D.calItems();
  const f = filter !== 'overall' && items.some((it) => it.id === filter) ? filter : 'overall';
  const fItem = f === 'overall' ? null : items.find((it) => it.id === f)!;
  const sk = D.streaks(), hp = D.habitsHitPct();
  const m0 = d(month), yr = m0.getUTCFullYear(), mo = m0.getUTCMonth();
  const lead = (m0.getUTCDay() + 6) % 7, last = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate();
  const cls = CAL_CLS(c);
  let hitDays = 0, dueDays = 0;
  const cells = Array.from({ length: last }, (_, j) => {
    const dt = new Date(Date.UTC(yr, mo, j + 1)), k = key(dt);
    if (k < START || k > END) return { k, n: j + 1, cl: 'out' };
    if (k > maxDay) return { k, n: j + 1, cl: 'future' };
    if (!fItem) {
      const sc = D.dayScore(k);
      let cl: string;
      if (!sc.logged && !(engine.plan(k).type === 'lift' && D.itemState('workout', k) === 'met')) cl = k === maxDay ? 'k-pend' : 'k-empty';
      else { const p = sc.due ? sc.hit / sc.due : 0; cl = p >= 1 ? 'k-full' : p >= 0.5 ? 'k-most' : p > 0 ? 'k-some' : k === maxDay ? 'k-pend' : 'k-none'; }
      dueDays++; if (sc.due && sc.hit >= sc.due) hitDays++;
      return { k, n: j + 1, cl };
    }
    const st = D.itemState(fItem.id, k);
    if (st !== 'rest' && !(k === maxDay && (st === 'pend' || st === 'na'))) { dueDays++; if (st === 'met') hitDays++; }
    return { k, n: j + 1, cl: ({ met: 'k-met', miss: 'k-miss', over: 'k-over', na: 'k-empty', rest: 'k-rest', pend: 'k-pend' } as Record<string, string>)[st] };
  });
  const fHabit = fItem ? habits.find((h) => h.id === fItem.id) : null;
  const kind = !fItem ? 'overall' : fItem.id === 'workout' ? 'workout' : fItem.id === 'food' ? 'food' : fHabit?.type === 'limit' ? 'limit' : 'build';
  const selDay = sel < START || sel > maxDay ? maxDay : sel;
  const sc2 = D.dayScore(selDay);
  const MK: Record<string, [string, string]> = { met: ['✓', c.cat.move.ink], miss: ['✗', c.warn], over: ['!', c.danger], na: ['?', c.muted], pend: ['…', c.ink2] };
  const statCells: [string, string, string][] = [
    ['Session streak', String(sk.cur), sk.cur > 0 ? "rest days don't break it" : sk.sched ? 'broken, the next session restarts it' : `starts on ${shortDate(d(START))}`],
    ['Longest streak', String(sk.best), 'sessions in a row'],
    ['Sessions done', String(sk.done), `of ${sk.sched} scheduled so far`],
    ['Sessions missed', String(sk.missed), 'planned days skipped'],
    ['Habits hit', hp == null ? '—' : `${hp}%`, 'of habit-days so far'],
    ['Days logged', String(sk.logged), `of ${sk.upto + 1} days elapsed`],
  ];
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Consistency</Text>
      <Text style={s.body2}>A session is the day's planned work: the gym on lift days, the walk on cardio days. Rest days don't count.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
        {statCells.map(([k, v, n]) => (
          <View key={k} style={{ width: '50%', paddingRight: 10 }}>
            <Text style={s.label}>{k}</Text><Text style={s.stat}>{v}</Text><Text style={s.label}>{n}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[{ id: 'overall', name: 'Overall' }, ...items].map((it) => {
          const on = f === it.id;
          return (
            <Pressable key={it.id} onPress={() => { setFilter(it.id); try { localStorage.setItem('goa:calf', it.id); } catch { /* ignore */ } }}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? c.ink : c.surface2 }} accessibilityState={{ selected: on }}>
              <Text style={{ fontFamily: font.medium, color: on ? c.paper : c.ink2 }}>{it.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => shift(-1)} disabled={month <= clamp(monthKey(d(START)))} accessibilityLabel="Previous month" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: month <= clamp(monthKey(d(START))) ? 0.3 : 1 }}><Text style={{ fontSize: 24, color: c.ink }}>‹</Text></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.section}>{MONTHS[mo]} {yr}</Text>
          <Text style={s.label}>{!dueDays ? '' : fItem ? `${hitDays} of ${dueDays} days hit` : `${hitDays} full day${hitDays === 1 ? '' : 's'} of ${dueDays}`}</Text>
        </View>
        <Pressable onPress={() => shift(1)} disabled={month >= clamp(monthKey(d(END)))} accessibilityLabel="Next month" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: month >= clamp(monthKey(d(END))) ? 0.3 : 1 }}><Text style={{ fontSize: 24, color: c.ink }}>›</Text></Pressable>
      </View>
      <View {...pan.panHandlers}>
        <View style={{ flexDirection: 'row' }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <Text key={i} style={[s.label, { flex: 1, textAlign: 'center' }]}>{x}</Text>)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, marginTop: 6 }}>
          {Array.from({ length: lead }, (_, i) => <View key={'b' + i} style={{ width: `${100 / 7}%` }} />)}
          {cells.map((x) => {
            const st = cls[x.cl] ?? cls['k-empty'];
            return (
              <View key={x.k} style={{ width: `${100 / 7}%`, paddingHorizontal: 3 }}>
                <Pressable disabled={x.cl === 'out' || x.cl === 'future'} onPress={() => setSel(x.k)} accessibilityLabel={`${fmt(d(x.k))}`}
                  style={{ height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: st.bg, borderWidth: x.k === selDay ? 2 : st.border ? 1 : 0,
                    borderColor: x.k === selDay ? c.ink : st.border }}>
                  <Text style={{ fontFamily: x.k === maxDay ? font.bold : font.medium, color: st.fg, fontVariant: ['tabular-nums'] }}>{x.n}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {(LEG[kind] ?? LEG.overall).map(([k, l]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: cls[k].bg, borderWidth: cls[k].border ? 1 : 0, borderColor: cls[k].border }} />
            <Text style={s.label}>{l}</Text>
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={[s.body, { fontFamily: font.semibold }]}>{fmt(d(selDay))}{selDay === maxDay ? ' · today' : ''}</Text>
          <Text style={s.label}>{sc2.hit} of {sc2.due} done</Text>
        </View>
        {items.map((it) => {
          const st = D.itemState(it.id, selDay);
          const [glyph, col] = st === 'rest' ? ['–', c.muted] : MK[st];
          return (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
              <Text style={{ width: 20, textAlign: 'center', color: col, fontFamily: font.bold }}>{glyph}</Text>
              <Text style={[s.body, { flex: 1 }]}>{it.name}</Text>
              <Text style={s.label}>{st === 'rest' ? 'rest day' : D.itemValTxt(it.id, selDay)}</Text>
            </View>
          );
        })}
        <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={() => { setDay(selDay); router.navigate('/train'); }}><Text style={s.outlineText}>Open this day</Text></Pressable>
      </View>
    </View>
  );
}

/** Load volume per exercise over the goal (r19 renderProg). */
function VolumeChart() {
  const { engine } = useRecomp();
  const { D, loaded } = useDays();
  const { c, s } = useTheme('body');
  const { width } = useWindowDimensions();
  const list = useMemo(() => (loaded ? D.progExercises() : []), [D, loaded]);
  const [pick, setPick] = useState<string | null>(() => { try { return localStorage.getItem('goa:prog'); } catch { return null; } });
  if (!list.length) return null;
  const nm = pick && list.some((x) => x.nm === pick) ? pick : list[0].nm;
  const ser = D.exSeries(nm);
  const W = width - 40 - 36, H = 200, mL = 44, mR = 12, mT = 14, mB = 24, iw = W - mL - mR, ih = H - mT - mB;
  const { START, TOTAL } = engine.T;
  const idx = (k: string) => diffDays(d(START), d(k));
  const vmax = Math.max(...ser.map((p) => p.vol)) * 1.15, vmin = Math.min(...ser.map((p) => p.vol)) * 0.85;
  const X = (k: string) => mL + (idx(k) / Math.max(1, TOTAL - 1)) * iw, Y = (v: number) => mT + ih - ((v - vmin) / Math.max(1, vmax - vmin)) * ih;
  const first = ser[0], lastP = ser[ser.length - 1];
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Load volume</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {list.map((x) => (
          <Pressable key={x.nm} onPress={() => { setPick(x.nm); try { localStorage.setItem('goa:prog', x.nm); } catch { /* ignore */ } }}
            style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: x.nm === nm ? c.cat.body.soft : c.surface2 }}>
            <Text style={{ fontFamily: font.medium, color: x.nm === nm ? c.cat.body.ink : c.ink2 }}>{x.nm} · {x.n}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {ser.length < 2 ? (
        <Text style={s.body2}>{nm}: {Math.round(ser[0].vol).toLocaleString('en-IN')} kg on {shortDate(d(ser[0].k))}. One session so far, a line appears on the next.</Text>
      ) : (
        <>
          <Svg width={W} height={H}>
            {[vmin, (vmin + vmax) / 2, vmax].map((v) => (
              <SvgText key={v} x={mL - 6} y={Y(v) + 4} fontSize={10} fill={c.muted} textAnchor="end" fontFamily={font.regular}>{Math.round(v).toLocaleString('en-IN')}</SvgText>
            ))}
            <Line x1={mL} x2={W - mR} y1={mT + ih} y2={mT + ih} stroke={c.line} />
            <Polyline points={ser.map((p) => `${X(p.k)},${Y(p.vol)}`).join(' ')} fill="none" stroke={c.cat.train.fill} strokeWidth={2.5} strokeLinejoin="round" />
            {ser.map((p) => <Circle key={p.k} cx={X(p.k)} cy={Y(p.vol)} r={3} fill={c.cat.train.fill} />)}
            <SvgText x={mL} y={H - 6} fontSize={10} fill={c.muted} fontFamily={font.regular}>{shortDate(d(first.k))}</SvgText>
            <SvgText x={W - mR} y={H - 6} fontSize={10} fill={c.muted} textAnchor="end" fontFamily={font.regular}>{shortDate(d(lastP.k))}</SvgText>
          </Svg>
          <Text style={s.body2}>{nm}: {Math.round(lastP.vol).toLocaleString('en-IN')} kg last time, {(() => { const p = Math.round(((lastP.vol - first.vol) / first.vol) * 100); return p > 0 ? `up ${p}%` : p < 0 ? `down ${-p}%` : 'level'; })()} on the first session ({Math.round(first.vol).toLocaleString('en-IN')} kg). Weight × reps; bodyweight and timed sets don't count.</Text>
        </>
      )}
    </View>
  );
}

/** r19 renderTable: the last 14 days ending today, folded by default. */
function DailyLog() {
  const { engine, maxDay } = useRecomp();
  const { D, entries } = useDays();
  const { c, s } = useTheme('body');
  const [open, setOpen] = useState(false);
  const { START, TOTAL } = engine.T;
  const sr = D.series();
  const end = Math.max(0, Math.min(TOTAL - 1, diffDays(d(START), d(maxDay)))), startI = Math.max(0, end - 13);
  const COLS = [64, 40, 56, 56, 64, 64, 64, 50, 110];
  const Cell = ({ v, i, ok, head }: { v: string; i: number; ok?: boolean | null; head?: boolean }) => (
    <Text style={[head ? s.label : [s.body, s.num], { width: COLS[i], paddingHorizontal: 4, paddingVertical: 8, textAlign: i >= 1 && i <= 7 ? 'right' : 'left' },
      ok === true && { color: c.cat.move.ink, fontFamily: font.semibold }, ok === false && { color: c.warn }, v === '—' && { color: c.muted }]} numberOfLines={1}>{v}</Text>
  );
  return (
    <View style={s.card}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }} accessibilityState={{ expanded: open }}>
        <Text style={s.section}>Daily log, last 14 days</Text>
        <Text style={{ color: c.muted, fontSize: 18 }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && (
        <ScrollView horizontal>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.lineSoft }}>
              {['Date', 'Day', 'Weight', '7-day', 'Protein', 'kcal', 'Steps', 'Sleep', 'Session'].map((h, i) => <Cell key={h} v={h} i={i} head />)}
            </View>
            {Array.from({ length: end - startI + 1 }, (_, j) => end - j).map((i) => {
              const k = sr[i].k, e = entries[k] ?? {}, pl = engine.plan(k), r = D.rolling(sr, i);
              const pv = (v: number | undefined, t: number, inv?: boolean) => (v == null ? null : inv ? v <= t : v >= t);
              return (
                <View key={k} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.lineSoft }}>
                  <Cell v={shortDate(d(k))} i={0} />
                  <Cell v={String(i + 1)} i={1} />
                  <Cell v={e.w != null ? e.w.toFixed(1) : '—'} i={2} />
                  <Cell v={r != null ? r.toFixed(1) : '—'} i={3} />
                  <Cell v={e.protein != null ? e.protein.toLocaleString('en-IN') : '—'} i={4} ok={pv(e.protein, (pl.protein || 120) - 10)} />
                  <Cell v={e.kcal ? e.kcal.toLocaleString('en-IN') : '—'} i={5} ok={e.kcal ? e.kcal <= pl.kcal + 100 : null} />
                  <Cell v={e.steps != null ? e.steps.toLocaleString('en-IN') : '—'} i={6} ok={pv(e.steps, pl.steps)} />
                  <Cell v={e.sleep != null ? trimNum(e.sleep) : '—'} i={7} ok={pv(e.sleep, 7)} />
                  <Cell v={pl.session ? engine.NAMES[pl.session] : pl.type === 'rest' ? 'Rest' : 'Cardio'} i={8} />
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
