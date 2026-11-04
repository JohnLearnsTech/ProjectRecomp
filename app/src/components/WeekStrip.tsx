import { useMemo, useRef } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { addKey, d, dayLetter, mondayOf } from '../domain/dates';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

type Dot = 'out' | 'future' | 'empty' | 'pend' | 'full' | 'most' | 'some' | 'none';

/**
 * Seven-day strip (Monday to Sunday) under the title on Today and Food. Tap a day to browse it,
 * swipe or use the arrows to change week. Dots follow r19 dotState.
 */
export function WeekStrip() {
  const { engine, day, setDay, maxDay, rev } = useRecomp();
  const { c } = useTheme();
  const { START, END } = engine.T;
  const mon = mondayOf(day);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addKey(mon, i)), [mon]);
  // r19 dotState over the workout, food and every habit.
  const { D, loaded } = useDays();
  const dots = useMemo(() => Object.fromEntries(days.map((k) => [k, loaded ? (D.dotState(k) as Dot) : 'empty'])), [days, D, loaded]);
  void rev;

  const canPrev = days[0] > START, canNext = days[6] < END;
  const go = (n: number) => setDay(addKey(day, n * 7));
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) > 45) goRef.current(g.dx < 0 ? 1 : -1); },
  })).current;
  const goRef = useRef(go); goRef.current = (n) => { if ((n < 0 && canPrev) || (n > 0 && canNext)) go(n); };

  const dotColor = (s: Dot | undefined) =>
    s === 'full' ? c.cat.move.fill : s === 'most' ? c.cat.move.fill + '8c' : s === 'some' ? c.line : s === 'none' ? c.warn : 'transparent';

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
