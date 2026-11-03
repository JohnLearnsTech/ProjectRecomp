import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { addKey, d, diffDays, shortDate } from '../domain/dates';
import * as db from '../lib/db';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

// r19 "Calories vs target" (05-business-logic §5.14 KMETRIC). Eaten per day as bars, the
// target as a dashed line. Ceiling metrics miss when eaten > target + margin; floor metrics
// when eaten < target - margin. Days with no food are left out rather than drawn as zero.
type Metric = 'kcal' | 'protein' | 'carb' | 'fat' | 'fiber';
const METRICS: { id: Metric; label: string; unit: string; ceiling: boolean; margin: number }[] = [
  { id: 'kcal', label: 'Calories', unit: 'kcal', ceiling: true, margin: 100 },
  { id: 'protein', label: 'Protein', unit: 'g', ceiling: false, margin: 15 },
  { id: 'carb', label: 'Carbs', unit: 'g', ceiling: true, margin: 30 },
  { id: 'fat', label: 'Fat', unit: 'g', ceiling: true, margin: 12 },
  { id: 'fiber', label: 'Fiber', unit: 'g', ceiling: false, margin: 6 },
];
const RANGES = [['1W', 7], ['1M', 30], ['3M', 90], ['Goal', 0]] as const;

export function FoodChart() {
  const { engine, maxDay, rev } = useRecomp();
  const { c, s } = useTheme('food');
  const { width } = useWindowDimensions();
  const [metric, setMetric] = useState<Metric>('kcal');
  const [range, setRange] = useState<number>(30);
  const [vals, setVals] = useState<Record<string, number>>({});
  const M = METRICS.find((m) => m.id === metric)!;
  const { START } = engine.T;
  const from = range ? (addKey(maxDay, -(range - 1)) < START ? START : addKey(maxDay, -(range - 1))) : START;
  const days = useMemo(() => { const out: string[] = []; for (let k = from; k <= maxDay; k = addKey(k, 1)) out.push(k); return out; }, [from, maxDay]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const out: Record<string, number> = {};
      if (metric === 'kcal' || metric === 'protein') {
        (await db.listDayLogs(from, maxDay)).forEach((l) => {
          const v = metric === 'kcal' ? l.kcal_total : l.protein_total_g;
          if (v != null && (l.kcal_total ?? 0) > 0) out[l.date] = v;
        });
      } else {
        const col = metric === 'carb' ? 'carbs_g' : metric === 'fat' ? 'fat_g' : 'fiber_g';
        (await db.listFoodRange(from, maxDay)).forEach((r) => { out[r.date] = (out[r.date] ?? 0) + +r[col]; });
      }
      if (live) setVals(out);
    };
    load().catch(() => {});
    return () => { live = false; };
  }, [metric, from, maxDay, rev]);

  const target = (k: string) => {
    const p = engine.plan(k), t = engine.PL.targets;
    return metric === 'kcal' ? p.kcal : metric === 'protein' ? p.protein : metric === 'carb' ? t.carb : metric === 'fat' ? t.fat : t.fiber;
  };
  const logged = days.filter((k) => vals[k] != null);
  const avg = logged.length ? logged.reduce((a, k) => a + vals[k], 0) / logged.length : null;
  const avgT = logged.length ? logged.reduce((a, k) => a + target(k), 0) / logged.length : null;
  const miss = (k: string) => (M.ceiling ? vals[k] > target(k) + M.margin : vals[k] < target(k) - M.margin);

  const W = width - 40 - 36, H = 180, padL = 40, padB = 22, ih = H - padB - 8;
  const maxV = Math.max(1, ...days.map((k) => Math.max(vals[k] ?? 0, target(k)))) * 1.1;
  const x = (i: number) => padL + (days.length <= 1 ? (W - padL) / 2 : (i * (W - padL - 8)) / (days.length - 1));
  const y = (v: number) => 8 + ih - (v / maxV) * ih;
  const bw = Math.max(2, Math.min(14, ((W - padL) / Math.max(1, days.length)) * 0.6));
  const ticks = [0, 0.5, 1].map((f) => Math.round((maxV / 1.1) * f));
  const fmtV = (v: number) => Math.round(v).toLocaleString('en-IN');

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{M.label} vs target</Text>
      <Segmented items={METRICS.map((m) => [m.id, m.label])} value={metric} onChange={(v) => setMetric(v as Metric)} />
      <Segmented items={RANGES.map(([l, n]) => [String(n), l])} value={String(range)} onChange={(v) => setRange(+v)} small />
      <Svg width={W} height={H}>
        {ticks.map((t) => (
          <SvgText key={t} x={padL - 6} y={y(t) + 4} fontSize={10} fill={c.muted} textAnchor="end" fontFamily={font.regular}>{fmtV(t)}</SvgText>
        ))}
        <Line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke={c.line} strokeWidth={1} />
        {days.map((k, i) => vals[k] != null && (
          <Rect key={k} x={x(i) - bw / 2} y={y(vals[k])} width={bw} height={Math.max(1, y(0) - y(vals[k]))} rx={Math.min(3, bw / 2)}
            fill={miss(k) ? c.warn : c.cat.food.fill} />
        ))}
        <Polyline points={days.map((k, i) => `${x(i)},${y(target(k))}`).join(' ')} fill="none" stroke={c.muted} strokeWidth={1.5} strokeDasharray="5 4" />
        {[0, days.length - 1].filter((v, i, a) => a.indexOf(v) === i && days[v]).map((i) => (
          <SvgText key={i} x={x(i)} y={H - 6} fontSize={10} fill={c.muted} textAnchor={i === 0 ? 'start' : 'end'} fontFamily={font.regular}>{shortDate(d(days[i]))}</SvgText>
        ))}
      </Svg>
      <Text style={s.body2}>
        {avg == null || avgT == null
          ? 'Nothing logged in this range yet.'
          : `Averaging ${fmtV(avg)} ${M.unit} against a ${fmtV(avgT)} ${M.unit} target over ${logged.length} logged day${logged.length > 1 ? 's' : ''}, ` +
            (Math.abs(avg - avgT) <= M.margin ? 'on target.' : `${fmtV(Math.abs(avg - avgT))} ${M.unit} ${avg < avgT ? 'under' : 'over'}.`) +
            (metric === 'kcal' && avg < avgT - M.margin ? ' Keep protein up so the loss comes from fat, not muscle.' : '')}
      </Text>
      {range === 0 && diffDays(d(START), d(maxDay)) > 120 && <Text style={s.label}>Long ranges load every food row, so this can take a moment.</Text>}
    </View>
  );
}

function Segmented({ items, value, onChange, small }: { items: (readonly [string, string])[]; value: string; onChange: (v: string) => void; small?: boolean }) {
  const { c } = useTheme('food');
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map(([id, label]) => {
        const on = id === value;
        return (
          <Pressable key={id} onPress={() => onChange(id)} accessibilityState={{ selected: on }}
            style={{ paddingHorizontal: small ? 12 : 14, minHeight: small ? 36 : 40, justifyContent: 'center', borderRadius: 999,
              backgroundColor: on ? (small ? c.cat.food.soft : c.ink) : c.surface2 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: on ? (small ? c.cat.food.ink : c.paper) : c.ink2 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
