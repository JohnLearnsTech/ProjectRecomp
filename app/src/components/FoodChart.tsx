import { useEffect, useState, type ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';
import { addDays, d, diffDays, key } from '../domain/dates';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';
import { endPoint, frame, poly, valueLabels, xTicks, yGrid } from './chart';
import { Segmented } from './ui';

// r19 "Calories vs target" (renderKcalChart): the day's value as a thin line with dots (amber on
// a missed day), the trailing 7-day average in gold, the target dashed, labels on the points.
type Metric = 'kcal' | 'protein' | 'carb' | 'fat' | 'fiber';
const KMETRIC: Record<Metric, { label: string; u: string; floor: boolean; margin: number }> = {
  kcal: { label: 'Calories', u: 'kcal', floor: false, margin: 100 }, protein: { label: 'Protein', u: 'g', floor: true, margin: 15 },
  carb: { label: 'Carbs', u: 'g', floor: false, margin: 30 }, fat: { label: 'Fat', u: 'g', floor: false, margin: 12 }, fiber: { label: 'Fiber', u: 'g', floor: true, margin: 6 },
};
const RANGES: [number, string][] = [[7, '1W'], [30, '1M'], [90, '3M'], [0, 'Goal']];
const read = (k: string, d0: string) => { try { return localStorage.getItem(k) || d0; } catch { return d0; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function FoodChart() {
  const { engine, maxDay, rev } = useRecomp();
  const { entries } = useDays();
  const { c, s } = useTheme('food');
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState<Metric>(() => (read('recomp:kcalmetric', 'kcal') as Metric) in KMETRIC ? read('recomp:kcalmetric', 'kcal') as Metric : 'kcal');
  const [range, setRange] = useState<number>(() => +read('recomp:kcalrange', '30') || 0);
  const [macro, setMacro] = useState<Record<string, number>>({});
  const M = KMETRIC[metric];
  const { START, TOTAL } = engine.T;
  const tIdx = Math.max(0, Math.min(TOTAL - 1, diffDays(d(START), d(maxDay))));
  let i0 = 0, i1 = TOTAL - 1;
  if (range > 0) { i1 = tIdx; i0 = Math.max(0, tIdx - range + 1); if (i1 - i0 < 2) i1 = Math.min(TOTAL - 1, i0 + 2); }
  const kAt = (i: number) => key(addDays(d(START), i));

  // Carbs, fat and fiber come from the food rows; calories and protein are the day totals.
  useEffect(() => {
    if (metric === 'kcal' || metric === 'protein') return;
    let live = true;
    const col = metric === 'carb' ? 'carbs_g' : metric === 'fat' ? 'fat_g' : 'fiber_g';
    db.listFoodRange(kAt(i0), kAt(i1)).then((rows) => { const out: Record<string, number> = {}; rows.forEach((r) => { out[r.date] = (out[r.date] ?? 0) + +r[col]; }); if (live) setMacro(out); }).catch(() => {});
    return () => { live = false; };
  }, [metric, i0, i1, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const tgt = (k: string) => { const p = engine.plan(k), t = engine.PL.targets; return metric === 'kcal' ? p.kcal : metric === 'protein' ? p.protein || 180 : metric === 'carb' ? t.carb || 200 : metric === 'fat' ? t.fat || 65 : t.fiber || 33; };
  const eaten = (i: number): number | null => {
    const k = kAt(i), e = entries[k];
    if (metric === 'kcal') return e && e.kcal != null && +e.kcal > 0 ? +e.kcal : null;
    if (metric === 'protein') return e && e.protein != null ? +e.protein : null;
    return macro[k] ?? null;
  };
  const E: (number | null)[] = []; for (let i = i0; i <= i1; i++) E.push(eaten(i));
  const at = (i: number) => E[i - i0];
  const avgAt = (i: number) => { const v: number[] = []; for (let j = Math.max(i0, i - 6); j <= i; j++) if (at(j) != null) v.push(at(j)!); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

  let ys: number[] = [];
  for (let i = i0; i <= i1; i++) { ys.push(tgt(kAt(i))); if (at(i) != null) ys.push(at(i)!); }
  if (ys.length < 2) ys = [0, tgt(kAt(i1)) * 1.4];
  const lo = Math.min(...ys), hi = Math.max(...ys), rg = Math.max(hi - lo, hi * 0.08, 1), pad = rg * 0.22;
  const cardW = Math.min(width, 520) - 40 - 36;
  const f = frame(cardW, i0, i1, Math.max(0, lo - pad), hi + pad, 52, 44);
  const kFmt = (v: number) => (metric === 'kcal' ? Math.round(v).toLocaleString('en-US') : String(Math.round(v)));

  const pts: { x: number; y: number; v: number; i: number }[] = [];
  for (let i = i0; i <= i1; i++) if (at(i) != null) pts.push({ x: f.X(i), y: f.Y(at(i)!), v: at(i)!, i });
  const miss = (i: number) => (M.floor ? at(i)! < tgt(kAt(i)) - M.margin : at(i)! > tgt(kAt(i)) + M.margin);
  const avgPts: [number, number][] = []; for (let i = i0; i <= i1; i++) { const a = avgAt(i); if (a != null) avgPts.push([f.X(i), f.Y(a)]); }
  const last = pts[pts.length - 1];

  // Footnote: the window's average against the average target over every day shown.
  let note: ReactNode;
  if (!pts.length) note = metric === 'kcal' || metric === 'protein' ? 'Log a few days and the trend line and average appear here.' : 'Carbs, fat and fiber come from item-level food entries. Log meals as items and this fills in.';
  else {
    const mean = Math.round(pts.reduce((a, p) => a + p.v, 0) / pts.length);
    let tsum = 0; for (let i = i0; i <= i1; i++) tsum += tgt(kAt(i));
    const tavg = Math.round(tsum / (i1 - i0 + 1)), diff = mean - tavg, close = Math.max(M.margin * 0.8, tavg * 0.04), U = ' ' + M.u;
    const missN = pts.filter((p) => miss(p.i)).length;
    const B = ({ t }: { t: string }) => <Text style={{ fontFamily: font.bold, color: c.ink }}>{t}</Text>;
    let verdict: ReactNode;
    if (Math.abs(diff) < close) verdict = ', right on it.';
    else if (M.floor) verdict = diff < 0 ? <>, <B t={Math.abs(diff) + U} /> short{metric === 'protein' ? ' — this is the one to push up. Protein protects muscle in the deficit.' : '.'}</> : <>, <B t={diff + U} /> over, which is fine for a floor.</>;
    else if (metric === 'kcal') verdict = diff < 0 ? <>, <B t={Math.abs(diff).toLocaleString('en-US') + U} /> under — a real deficit. Keep protein up so the loss comes from fat, not muscle.</> : <>, <B t={diff.toLocaleString('en-US') + U} /> over.</>;
    else verdict = diff > 0 ? <>, <B t={diff + U} /> over.</> : <>, <B t={Math.abs(diff) + U} /> under, room to spare.</>;
    note = <>Averaging <B t={kFmt(mean) + U} /> against a <B t={kFmt(tavg) + U} /> target{verdict}{missN ? ` ${missN} day${missN > 1 ? 's' : ''}${M.floor ? ' under' : ' over'} target (amber).` : ''}</>;
  }

  const sw = (col: string, l: string, op = 1) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: col, opacity: op }} />
      <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: c.ink2 }}>{l}</Text>
    </View>
  );
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{metric === 'kcal' ? 'Calories' : M.label} vs target</Text>
      <Segmented dark items={(Object.keys(KMETRIC) as Metric[]).map((m) => [m, KMETRIC[m].label])} value={metric} onChange={(m) => { setMetric(m); save('recomp:kcalmetric', m); }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {sw(c.cat.food.fill, metric === 'kcal' ? 'Eaten' : M.label)}{sw(c.gold, '7-day average')}{sw(c.muted, 'Target', 0.65)}
      </View>
      <Segmented cat="food" items={RANGES} value={range} onChange={(r) => { setRange(r); save('recomp:kcalrange', String(r)); }} />
      <Svg width={f.W} height={f.H}>
        {yGrid(f, c, (v) => Math.round(v).toLocaleString('en-US'))}
        {xTicks(f, c, START)}
        <Polyline points={poly(Array.from({ length: i1 - i0 + 1 }, (_, j) => [f.X(i0 + j), f.Y(tgt(kAt(i0 + j)))]))} fill="none" stroke={c.muted} strokeWidth={2} strokeDasharray="5 5" opacity={0.6} />
        {pts.length > 1 && <Polyline points={poly(pts.map((p) => [p.x, p.y]))} fill="none" stroke={c.cat.food.fill} strokeWidth={1.6} opacity={0.5} strokeLinejoin="round" />}
        {avgPts.length > 1 && <Polyline points={poly(avgPts)} fill="none" stroke={c.gold} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p) => <Circle key={p.i} cx={p.x} cy={p.y} r={3} fill={miss(p.i) ? c.warn : c.cat.food.fill} />)}
        {valueLabels(pts.slice(0, -1), f, 34, kFmt, c, last)}
        {last && endPoint(f, c, last, kFmt(last.v), c.cat.food.fill, c.cat.food.ink)}
        {!pts.length && <SvgText x={f.mL + f.iw / 2} y={f.mT + f.ih / 2} textAnchor="middle" fill={c.muted} fontSize={13} fontFamily={font.regular}>
          {metric === 'kcal' || metric === 'protein' ? 'Log food to start the line' : 'Log food with item-level detail to chart ' + M.label.toLowerCase()}</SvgText>}
      </Svg>
      <Text style={[s.body2, { fontSize: 13.5, lineHeight: 20 }]}>{note}</Text>
      {range === 0 && diffDays(d(START), d(maxDay)) > 120 && metric !== 'kcal' && metric !== 'protein' && <Text style={s.label}>Long ranges load every food row, so this can take a moment.</Text>}
    </View>
  );
}
