import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { addKey, d, dayLetter, mondayOf } from '../domain/dates';
import * as db from '../lib/db';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

type Dot = 'out' | 'future' | 'empty' | 'pend' | 'full' | 'most' | 'some' | 'none';

/**
 * Seven-day strip (Monday to Sunday) under the title on Today and Food. Tap a day to browse it,
 * swipe or use the arrows to change week. Dots follow r19 dotState over workout and food;
 * habits join the score in build step 4.
 */
export function WeekStrip() {
  const { engine, day, setDay, maxDay, rev } = useRecomp();
  const { c } = useTheme();
  const { START, END } = engine.T;
  const mon = mondayOf(day);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addKey(mon, i)), [mon]);
  const [dots, setDots] = useState<Record<string, Dot>>({});

  useEffect(() => {
    let live = true;
    const from = days[0], to = days[6];
    Promise.all([db.listDayLogs(from, to), db.listSetSummary(from, to), db.listTicks(from, to)]).then(([logs, sets, ticks]) => {
      if (!live) return;
      const out: Record<string, Dot> = {};
      for (const k of days) {
        if (k < START || k > END) { out[k] = 'out'; continue; }
        if (k > maxDay) { out[k] = 'future'; continue; }
        const p = engine.plan(k), log = logs.find((l) => l.date === k);
        const trained = ticks.some((t) => t.date === k && t.check_id === 'train' && t.done) || sets.some((s) => s.date === k);
        const ate = (log?.kcal_total ?? 0) > 0;
        let due = 0, logged = 0, hit = 0;
        if (p.type === 'lift') { due++; if (trained) { logged++; hit++; } else if (k !== maxDay) logged++; }
        due++; if (ate) { logged++; hit++; }
        const anyLogged = ate || trained || !!log;
        if (!anyLogged) { out[k] = k === maxDay ? 'pend' : 'empty'; continue; }
        const f = due ? hit / due : 0;
        out[k] = f >= 1 ? 'full' : f >= 0.5 ? 'most' : f > 0 ? 'some' : k === maxDay ? 'pend' : 'none';
      }
      setDots(out);
    }).catch(() => {});
    return () => { live = false; };
  }, [days, START, END, maxDay, engine, rev]);

  const canPrev = days[0] > START, canNext = days[6] < END;
  const go = (n: number) => setDay(addKey(day, n * 7));
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 45) goRef.current(g.dx < 0 ? 1 : -1); },
  })).current;
  const goRef = useRef(go); goRef.current = (n) => { if ((n < 0 && canPrev) || (n > 0 && canNext)) go(n); };

  const dotColor = (s: Dot | undefined) =>
    s === 'full' ? c.cat.move.fill : s === 'most' ? c.cat.move.fill + '99' : s === 'some' ? c.line : s === 'none' ? c.warn : 'transparent';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} {...pan.panHandlers}>
      <Arrow label="Previous week" dir="‹" disabled={!canPrev} onPress={() => goRef.current(-1)} />
      {days.map((k) => {
        const sel = k === day, disabled = k < START || k > END;
        const dt = d(k);
        return (
          <Pressable key={k} disabled={disabled} onPress={() => setDay(k)} accessibilityLabel={k} accessibilityState={{ selected: sel }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 14, backgroundColor: sel ? c.ink : 'transparent', opacity: disabled ? 0.35 : 1, minHeight: 60 }}>
            <Text style={{ fontFamily: font.medium, fontSize: 12, color: sel ? c.paper : c.muted }}>{dayLetter(dt)}</Text>
            <Text style={{ fontFamily: font.semibold, fontSize: 18, color: sel ? c.paper : k > maxDay ? c.muted : c.ink, fontVariant: ['tabular-nums'] }}>{dt.getUTCDate()}</Text>
            <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: dotColor(dots[k]) }} />
          </Pressable>
        );
      })}
      <Arrow label="Next week" dir="›" disabled={!canNext} onPress={() => goRef.current(1)} />
    </View>
  );
}

function Arrow({ label, dir, disabled, onPress }: { label: string; dir: string; disabled: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={8}
      style={{ width: 28, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      <Text style={{ fontSize: 26, color: c.ink2, fontFamily: font.regular }}>{dir}</Text>
    </Pressable>
  );
}
