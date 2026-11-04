import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { addDays, d, key, shortDate } from '../domain/dates';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme, type Palette } from '../lib/theme';

export const DOT_NAME: Record<string, string> = { full: 'all done', most: 'most done', some: 'some done', none: 'missed', empty: 'nothing logged', pend: 'today, in progress', future: 'ahead', out: 'outside the plan' };
/** Colours for r19's dot and calendar states. Lightness differs, not hue alone. */
export const dotFill = (c: Palette, st: string) =>
  st === 'full' ? c.cat.move.fill : st === 'most' ? c.cat.move.fill + '8c' : st === 'some' ? c.cat.move.fill + '40' : st === 'none' ? c.warnSoft : 'transparent';

/** Today's Consistency card: four Monday-to-Sunday weeks, one pill a day; tap opens Progress. */
export function ConsistencyCard() {
  const { engine, maxDay } = useRecomp();
  const { D, loaded } = useDays();
  const { c, s } = useTheme('move');
  if (!loaded) return null;
  const { START, END } = engine.T;
  const mx = d(maxDay), dow = (mx.getUTCDay() + 6) % 7, mon = addDays(mx, -dow - 21);
  const cells = Array.from({ length: 28 }, (_, i) => { const dt = addDays(mon, i), k = key(dt); return { k, dt, st: k < START || k > END ? 'out' : D.dotState(k) }; });
  const sk = D.streaks();
  const wm = addDays(mx, -dow); let due = 0, done = 0;
  for (let j = 0; j < 7; j++) {
    const k = key(addDays(wm, j)), pl = engine.plan(k); if (!pl.inRange || pl.type === 'rest') continue;
    due++; if (k <= maxDay && D.dayState(k) === 'done') done++;
  }
  const hp = D.habitsHitPct();
  return (
    <Pressable style={s.card} onPress={() => router.navigate({ pathname: '/progress', params: { at: 'cal' } })} accessibilityLabel={`Consistency: ${done} of ${due} sessions this week. Open the full view`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.cardTitle}>Consistency</Text>
        <Text style={s.label}>{sk.cur > 0 ? <><Text style={{ fontFamily: font.bold, color: c.ink }}>{sk.cur}</Text> session streak</> : sk.best > 0 ? <>Best streak <Text style={{ fontFamily: font.bold, color: c.ink }}>{sk.best}</Text></> : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <Text key={i} style={[s.label, { flex: 1, textAlign: 'center' }]}>{x}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
        {cells.map(({ k, dt, st }) => (
          <View key={k} style={{ width: `${100 / 7}%`, paddingHorizontal: 3 }} accessibilityLabel={`${shortDate(dt)}: ${DOT_NAME[st] ?? st}`}>
            <View style={{ height: 22, borderRadius: 11, backgroundColor: dotFill(c, st), borderWidth: st === 'empty' || st === 'pend' || st === 'future' ? 1 : 0,
              borderColor: c.line, opacity: st === 'out' ? 0.3 : 1, ...(k === maxDay ? { borderWidth: 2, borderColor: c.ink } : null) }} />
          </View>
        ))}
      </View>
      <Text style={s.label}>
        {due ? <><Text style={{ fontFamily: font.bold, color: c.ink }}>{done}</Text> of {due} sessions this week</> : null}
        {due && hp != null ? '   ·   ' : ''}
        {hp != null ? <><Text style={{ fontFamily: font.bold, color: c.ink }}>{hp}%</Text> habits</> : null}
      </Text>
    </Pressable>
  );
}

let nudgeOff: string | null = (() => { try { return localStorage.getItem('goa:nudgeoff'); } catch { return null; } })();

/** r19 missed-session nudge: a slim warm line after skipped sessions, hidden until tomorrow on ×. */
export function Nudge() {
  const { real, maxDay, setDay } = useRecomp();
  const { D, loaded } = useDays();
  const { c, s } = useTheme('move');
  if (!loaded || nudgeOff === real) return null;
  const m = D.missStats();
  if (!(m.run >= 2 || m.since >= 3)) return null;
  const hard = m.run >= 4 || m.since >= 6;
  const count = m.run >= 2 ? m.run : m.since;
  const lab = m.run >= 2 ? 'skipped' : (m.since > 1 ? 'days' : 'day') + ' idle';
  const msg = !hard ? "You've skipped a couple. Don't aim for the whole session: one ten-minute walk today puts you back on the board."
    : m.since >= 8 || m.run >= 7 ? 'This is the gap the plan warned about. The fix is not a better week. It is the next ten minutes. Shoes on, out the door, that’s the win.'
    : 'This is becoming the pattern. Forget the full plan for today, just get outside for ten minutes and log it. Starting again costs one walk.';
  return (
    <View style={{ backgroundColor: hard ? c.warnSoft : c.surface, borderRadius: 16, padding: 14, gap: 8, borderLeftWidth: 4, borderLeftColor: c.warn }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 24, color: c.warn }}>{count}</Text>
        <Text style={[s.body, { flex: 1 }]}>{lab}</Text>
        <Pressable onPress={() => { setDay(maxDay); router.push('/quick'); }} style={[s.outline, { minHeight: 40 }]}><Text style={s.outlineText}>Log a walk</Text></Pressable>
        <Pressable onPress={() => { nudgeOff = real; try { localStorage.setItem('goa:nudgeoff', real); } catch { /* ignore */ } setDay(maxDay); }}
          accessibilityLabel="Hide until tomorrow" hitSlop={8}><Text style={{ fontSize: 18, color: c.ink2 }}>×</Text></Pressable>
      </View>
      <Text style={s.body2}>{msg}</Text>
    </View>
  );
}
