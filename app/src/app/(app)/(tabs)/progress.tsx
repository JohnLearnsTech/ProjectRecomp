import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { type LayoutChangeEvent, PanResponder, Pressable, RefreshControl, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
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
import { endPoint, frame, Halo, poly, valueLabels, xTicks, yGrid } from '../../../components/chart';
import { Icon } from '../../../components/Icon';
import { Guides } from '../../../components/Guides';
import { Badges } from '../../../components/Game';
import { PanelHead, Segmented, Stats as Stats2 } from '../../../components/ui';

// r19 PROG_LINKS: quick links that stay in reach while the page scrolls.
const LINKS: [string, string][] = [['chart', 'Weight'], ['stats', 'Numbers'], ['today', 'Log today'], ['cal', 'Consistency'], ['prog', 'Strength'], ['review', 'Weekly review'], ['log', 'Daily log'], ['rules', 'Guides']];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Progress() {
  const { at } = useLocalSearchParams<{ at?: string }>();
  const { c, s } = useTheme('body');
  const { reload } = useRecomp();
  const { reload: reloadDays } = useDays();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [calY, setCalY] = useState<number | null>(null);
  const ys = useRef<Record<string, number>>({});
  const [cur, setCur] = useState('chart');
  const mark = (k: string) => (e: LayoutChangeEvent) => { ys.current[k] = e.nativeEvent.layout.y; };
  useEffect(() => { if (at === 'review' && ys.current.review != null) { scroll.current?.scrollTo({ y: ys.current.review - 56, animated: true }); router.setParams({ at: undefined }); } }, [at, calY]);
  useEffect(() => { if (at === 'cal' && calY != null) { scroll.current?.scrollTo({ y: calY - 12, animated: true }); router.setParams({ at: undefined }); } }, [at, calY]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView ref={scroll} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]} scrollEventThrottle={64}
        onScroll={(e) => { const y = e.nativeEvent.contentOffset.y + 70; let k = LINKS[0][0]; LINKS.forEach(([id]) => { if ((ys.current[id] ?? 1e9) <= y) k = id; }); if (k !== cur) setCur(k); }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { reload(); reloadDays(); }} />}>
        <ScreenHeader title="Progress" strip={false} dayLine={false} cat="body" />
        <View style={{ backgroundColor: c.paper, marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {LINKS.map(([k, l]) => (
              <Pressable key={k} onPress={() => { const y = ys.current[k]; if (y != null) scroll.current?.scrollTo({ y: y - 56, animated: true }); setCur(k); }}
                style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: cur === k ? c.ink : c.line, backgroundColor: cur === k ? c.ink : c.surface }}>
                <Text style={{ fontFamily: font.medium, fontSize: 14, color: cur === k ? c.paper : c.ink2 }}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View onLayout={mark('chart')}><WeightChart /></View>
        <View onLayout={mark('stats')}><Stats /></View>
        <View onLayout={mark('today')}><WeighIn /></View>
        <View onLayout={(e) => { mark('cal')(e); setCalY(e.nativeEvent.layout.y); }}><ConsistencyFull /></View>
        <Badges />
        <View onLayout={mark('prog')}><VolumeChart /></View>
        <View onLayout={mark('review')}><ReviewCard /></View>
        <View onLayout={mark('log')}><DailyLog /></View>
        <View onLayout={mark('rules')}><Guides kind="rules" /></View>
        <Text style={[s.label, { marginTop: 8 }]}>Project Recomp is a training, nutrition and habits tool. Its targets come from standard formulas and your own logs; they are not medical advice.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/** r19 renderChart: weight (with the dashed plan line and earlier weigh-ins) or waist. */
function WeightChart() {
  const { engine, maxDay, rev } = useRecomp();
  const { D } = useDays();
  const { c, s } = useTheme('body');
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState<'weight' | 'waist'>(() => { try { return localStorage.getItem('recomp:metric') === 'waist' ? 'waist' : 'weight'; } catch { return 'weight'; } });
  const [range, setRange] = useState<number>(() => { try { const r = localStorage.getItem('recomp:range'); return r == null ? 30 : +r; } catch { return 30; } });
  const [hist, setHist] = useState<db.WeighIn[]>([]);
  useEffect(() => { db.listWeightHistory().then(setHist).catch(() => {}); }, [rev]);
  const { START, TOTAL, TARGET_KG } = engine.T;
  const isW = metric === 'weight';
  const tIdx = Math.max(0, Math.min(TOTAL - 1, diffDays(d(START), d(maxDay))));
  const histPts = isW ? hist.filter((h) => h.date < START).map((h) => ({ i: diffDays(d(START), d(h.date)), w: +h.kg })) : [];
  const lowB = histPts.length ? histPts[0].i : 0;
  let i0: number, i1: number;
  if (range > 0) { i1 = tIdx; i0 = Math.max(lowB, tIdx - range + 1); if (i1 - i0 < 2) i1 = Math.min(TOTAL - 1, i0 + 2); } else { i0 = lowB; i1 = TOTAL - 1; }
  const showHist = isW && histPts.some((p) => p.i >= i0);
  const sr = D.series();
  const val: (number | null)[] = new Array(TOTAL).fill(null);
  if (isW) sr.forEach((x, i) => { val[i] = x.w; });
  else D.waistSeries().forEach((x) => { const idx = diffDays(d(START), d(x.k)); if (idx >= 0 && idx < TOTAL) val[idx] = x.v; });
  let ys: number[] = [];
  for (let i = i0; i <= i1; i++) { if (isW && i >= 0) ys.push(D.projFor(i)); if (i >= 0 && val[i] != null) ys.push(val[i]!); }
  if (showHist) histPts.forEach((p) => { if (p.i >= i0) ys.push(p.w); });
  if (ys.length < 2) { const m = ys.length ? ys[0] : isW ? engine.T.START_KG : 0; ys = [m - 2, m + 2]; }
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max(0.4, (hi - lo) * 0.16);
  const f = frame(Math.min(width, 520) - 40 - 36, i0, i1, lo - pad, hi + pad);
  const pts: { x: number; y: number; v: number; i: number }[] = [];
  for (let i = Math.max(0, i0); i <= i1; i++) if (val[i] != null) pts.push({ x: f.X(i), y: f.Y(val[i]!), v: val[i]!, i });
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const col = c.cat.body.fill;
  const hv = showHist ? histPts.filter((p) => p.i >= i0) : [];
  const firstLive = pts[0] ?? (() => { for (let i = 0; i <= i1; i++) if (val[i] != null) return { x: f.X(i), y: f.Y(val[i]!) }; return null; })();
  const endTy = last ? Math.max(f.mT + 11, Math.min(f.mT + f.ih - 3, last.y + (prev == null || last.v <= prev.v ? 19 : -13))) : 0;
  const sw = (cl: string, l: string, op = 1) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: cl, opacity: op }} /><Text style={{ fontFamily: font.regular, fontSize: 11.5, color: c.ink2 }}>{l}</Text></View>
  );
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{isW ? 'Weight vs plan' : 'Waist'}</Text>
      <Segmented dark items={[['weight', 'Weight'], ['waist', 'Waist']]} value={metric} onChange={(v) => { setMetric(v); try { localStorage.setItem('recomp:metric', v); } catch { /* ignore */ } }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {isW ? <>{sw(col, 'Your weight')}{sw(c.muted, 'Projection', 0.65)}{showHist && sw(col, 'Before tracking', 0.4)}</> : sw(col, 'Waist at the navel')}
      </View>
      <Segmented cat="body" items={[[7, '1W'], [30, '1M'], [90, '3M'], [0, 'Goal']]} value={range} onChange={(r) => { setRange(r); try { localStorage.setItem('recomp:range', String(r)); } catch { /* ignore */ } }} />
      <Svg width={f.W} height={f.H}>
        {yGrid(f, c, (v, dec) => v.toFixed(dec))}
        {xTicks(f, c, START)}
        {isW && <Polyline points={poly(Array.from({ length: i1 - Math.max(i0, 0) + 1 }, (_, j) => { const i = Math.max(i0, 0) + j; return [f.X(i), f.Y(D.projFor(i))] as [number, number]; }))} fill="none" stroke={c.muted} strokeWidth={2} strokeDasharray="5 5" opacity={0.6} />}
        {isW && tIdx >= i0 && tIdx <= i1 && <Circle cx={f.X(tIdx)} cy={f.Y(D.projFor(tIdx))} r={4} fill={c.surface} stroke={c.muted} strokeWidth={2} />}
        {hv.length > 0 && <Polyline points={poly([...hv.map((p) => [f.X(p.i), f.Y(p.w)] as [number, number]), ...(firstLive ? [[firstLive.x, firstLive.y] as [number, number]] : [])])} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.38} />}
        {hv.map((p) => <Circle key={'h' + p.i} cx={f.X(p.i)} cy={f.Y(p.w)} r={2.6} fill={col} opacity={0.5} />)}
        {pts.length > 1 && <Polyline points={poly(pts.map((p) => [p.x, p.y]))} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p) => <Circle key={p.i} cx={p.x} cy={p.y} r={3.2} fill={col} />)}
        {valueLabels(pts.slice(0, -1), f, 30, (v) => v.toFixed(1), c, last)}
        {last && endPoint(f, c, last, last.v.toFixed(1), col, c.cat.body.ink, endTy)}
        {!pts.length && <SvgText x={f.mL + f.iw / 2} y={f.mT + f.ih / 2} textAnchor="middle" fill={c.muted} fontSize={13} fontFamily={font.regular}>
          {isW ? 'Log a weight to start the line' : 'Log a waist reading on a ' + WEEKDAY_NAMES[waistWeekday(engine.PROFILE)]}</SvgText>}
      </Svg>
      <Text style={[s.body2, { fontSize: 13.5, lineHeight: 20 }]}>
        {isW
          ? <>The dashed line is the plan: faster for the first fortnight (mostly water and glycogen), then steady{(engine.G.type || 'lose') === 'lose' ? ', with one flat maintenance week' : ''}. A landing between <Text style={{ fontFamily: font.bold, color: c.ink }}>{trimNum(TARGET_KG - 1.5)} and {trimNum(TARGET_KG + 3.5)} kg</Text> is the honest range.</>
          : `Measured every ${WEEKDAY_NAMES[waistWeekday(engine.PROFILE)]} at the navel. ${D.waistSeries().length > 1 ? 'Waist often keeps moving on the weeks the scale sits still — that is the whole reason to track it.' : 'Once there are two readings this draws a line you can follow.'}`}
      </Text>
    </View>
  );
}

function Stats() {
  const { day, engine } = useRecomp();
  const { D, loaded } = useDays();
  if (!loaded) return null;
  const st = D.stats(day);
  return (
    <Stats2 cols={2} items={[
      { k: 'Latest weight', v: st.latest != null ? `${st.latest.toFixed(1)} kg` : '—', n: st.latestDay ? shortDate(d(st.latestDay)) : 'log it below' },
      { k: '7-day average', v: st.avg != null ? `${st.avg.toFixed(1)} kg` : '—', n: st.avg != null ? 'the only number that counts' : 'needs 2+ entries in 7 days' },
      { k: `Change from ${trimNum(engine.T.START_KG)}`, v: st.delta != null ? `${st.delta > 0 ? '+' : ''}${st.delta.toFixed(1)} kg` : '—', n: `since ${shortDate(d(engine.T.START))}` },
      { k: 'On-plan target today', v: `${st.proj.toFixed(1)} kg`, n: st.projNote },
      { k: 'At your current rate', v: st.rate.value ?? '—', n: st.rate.note },
      { k: 'Days logged', v: String(st.loggedDays), n: `of ${st.total} days` },
    ]} />
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
      <PanelHead size={14} title="What you measured" info={{ label: 'About weighing', text: 'Weigh first thing in the morning, after the bathroom and before food or water, in the same clothes.' }} />
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
      <PanelHead title="Consistency" info={{ label: 'About this section', text: "A session is your planned work for the day: the gym on lift days, the walk on cardio days. Do that and the day counts, whatever else you skip. Rest days aren't sessions, so they never break a streak. Overall colours each day by how much of everything you got done (session, food, every habit); a walk counts on minutes or 2,000+ steps. Pick a chip to see one thing on its own. Tap a day for its breakdown; swipe to change month." }} />
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
              {/* r19 .dstat: a filled round tick when met, outlined circles for the rest. */}
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: st === 'met' ? c.cat.move.fill : 'transparent',
                borderWidth: st === 'met' ? 0 : 1.5, borderColor: st === 'rest' ? c.line : col }}>
                {st === 'met' ? <Icon name="check" size={12} stroke={3} color={c.cat.move.on} /> : <Text style={{ fontSize: 10, lineHeight: 12, color: col, fontFamily: font.bold }}>{st === 'pend' ? '···' : glyph}</Text>}
              </View>
              <Text style={[s.body, { flex: 1 }]}>{it.name}</Text>
              <Text style={[s.label, { fontFamily: font.semibold, color: c.ink2 }]}>{st === 'rest' ? 'rest day' : D.itemValTxt(it.id, selDay)}</Text>
            </View>
          );
        })}
        <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={() => { setDay(selDay); router.navigate('/train'); }}><Text style={s.outlineText}>Open this day</Text></Pressable>
      </View>
    </View>
  );
}

/** Load volume per exercise (r19 renderProg): one point per session, value labels, a picker. */
function VolumeChart() {
  const { D, loaded } = useDays();
  const { c, s } = useTheme('body');
  const { width } = useWindowDimensions();
  const list = useMemo(() => (loaded ? D.progExercises() : []), [D, loaded]);
  const [pick, setPick] = useState<string | null>(() => { try { return localStorage.getItem('goa:prog'); } catch { return null; } });
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  const nm = pick && list.some((x) => x.nm === pick) ? pick : list[0].nm;
  const ser = D.exSeries(nm);
  const W = Math.min(width, 520) - 40 - 36, H = 260, mL = W < 430 ? 44 : 52, mR = 18, mT = 16, mB = 28, iw = W - mL - mR, ih = H - mT - mB;
  const picker = (
    <View style={{ gap: 4 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel="Exercise" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignSelf: 'flex-start' }}>
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: c.ink }} numberOfLines={1}>{nm} · {list.find((x) => x.nm === nm)?.n}</Text>
        <Icon name="down" size={14} color={c.ink2} />
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, backgroundColor: c.surface, overflow: 'hidden' }}>
          {list.map((x) => (
            <Pressable key={x.nm} onPress={() => { setPick(x.nm); setOpen(false); try { localStorage.setItem('goa:prog', x.nm); } catch { /* ignore */ } }} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: x.nm === nm ? c.surface2 : c.surface }}>
              <Text style={{ fontFamily: x.nm === nm ? font.semibold : font.regular, fontSize: 14, color: c.ink }}>{x.nm} · {x.n}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <Text style={s.cardTitle}>Load volume</Text>{picker}
    </View>
  );
  if (ser.length < 2) return (
    <View style={s.card}>{head}
      <Svg width={W} height={H}><SvgText x={mL + iw / 2} y={mT + ih / 2} textAnchor="middle" fill={c.muted} fontSize={13} fontFamily={font.regular}>{ser.length ? 'One session so far — a line appears on the next.' : 'No countable sets logged for this exercise yet.'}</SvgText></Svg>
      {!!ser.length && <Text style={s.body2}>{nm}: {Math.round(ser[0].vol).toLocaleString('en-US')} kg on {shortDate(d(ser[0].k))}.</Text>}
    </View>
  );
  const vols = ser.map((p) => p.vol), hi = Math.max(...vols), lo = Math.min(...vols), pad = Math.max(1, (hi - lo) * 0.15);
  const yMin = Math.max(0, lo - pad), yMax = Math.max(hi + pad, yMin + 1), span = Math.max(1, ser.length - 1);
  const X = (i: number) => mL + (i / span) * iw, Y = (v: number) => mT + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const f = { W, H, mL, mR, mT, mB, iw, ih, i0: 0, i1: span, yMin, yMax, X, Y };
  const stepY = Math.max(1, Math.round((yMax - yMin) / 4));
  const grid: number[] = []; for (let g = Math.ceil(yMin / stepY) * stepY; g <= yMax; g += stepY) grid.push(g);
  const xi = ser.length <= 4 ? ser.map((_, i) => i) : [0, Math.round(span / 2), span];
  const col = c.cat.body.fill, last = ser[ser.length - 1], first = ser[0].vol;
  const lp = { x: X(span), y: Y(last.vol), v: last.vol };
  const pct = first > 0 ? Math.round(((last.vol - first) / first) * 100) : 0;
  return (
    <View style={s.card}>{head}
      <Svg width={W} height={H}>
        {grid.flatMap((g) => [<Line key={'l' + g} x1={mL} y1={Y(g)} x2={W - mR} y2={Y(g)} stroke={c.lineSoft} strokeWidth={1} />,
          <SvgText key={'t' + g} x={mL - 8} y={Y(g) + 4} textAnchor="end" fill={c.muted} fontSize={11} fontFamily={font.regular}>{g.toLocaleString('en-US')}</SvgText>])}
        {xi.map((i) => <SvgText key={'x' + i} x={X(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === span ? 'end' : 'middle'} fill={c.muted} fontSize={11} fontFamily={font.regular}>{shortDate(d(ser[i].k))}</SvgText>)}
        <Polyline points={poly(ser.map((p, i) => [X(i), Y(p.vol)]))} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {ser.map((p, i) => <Circle key={p.k} cx={X(i)} cy={Y(p.vol)} r={3.4} fill={col} />)}
        {valueLabels(ser.map((p, i) => ({ x: X(i), y: Y(p.vol), v: p.vol })).slice(0, -1), f, 44, (v) => Math.round(v).toLocaleString('en-US'), c, lp)}
        <Circle cx={lp.x} cy={lp.y} r={5} fill={col} stroke={c.surface} strokeWidth={2} />
        <Halo x={lp.x - 9} y={lp.y - 9} anchor="end" fill={c.cat.body.ink} halo={c.surface} size={12} w={3.5} family={font.bold} text={Math.round(last.vol).toLocaleString('en-US')} />
      </Svg>
      <Text style={[s.body2, { fontSize: 13.5, lineHeight: 20 }]}>{nm}: <Text style={{ fontFamily: font.bold, color: c.ink }}>{Math.round(last.vol).toLocaleString('en-US')} kg</Text> latest, {Math.abs(pct) < 3 ? 'about level with your first logged session.' : `${pct > 0 ? 'up ' : 'down '}${Math.abs(pct)}% from ${Math.round(first).toLocaleString('en-US')} kg on ${shortDate(d(ser[0].k))}.`} Volume is load × reps summed across sets.</Text>
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
