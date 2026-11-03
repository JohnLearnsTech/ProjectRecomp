import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { d, diffDays, shortDate } from '../domain/dates';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';
import { WeekStrip } from './WeekStrip';

/** Title, days-to-goal count, Me avatar, the day line and (optionally) the week strip. */
export function ScreenHeader({ title, strip = true }: { title: string; strip?: boolean }) {
  const { engine, day, maxDay, profileRow } = useRecomp();
  const { c, s } = useTheme();
  const { G, T } = engine;
  const left = diffDays(d(maxDay), d(T.DEPART));
  const p = engine.plan(day);
  const state = day === maxDay ? 'Today' : day > maxDay ? 'Preview' : 'Past day';
  const phaseName = engine.PL.phases[p.phase - 1]?.name.split('·').pop()?.trim();
  const dt = d(day);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={s.title} accessibilityRole="header">{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {left > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.stat, { color: c.cat.move.ink, lineHeight: 26 }]}>{left}</Text>
              <Text style={[s.label, { fontSize: 11 }]}>days to {G.name || 'the goal'}</Text>
            </View>
          )}
          <Link href="/me" asChild>
            <Pressable accessibilityLabel="Me" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 17, color: c.ink }}>{(profileRow?.name?.[0] ?? '·').toUpperCase()}</Text>
            </Pressable>
          </Link>
        </View>
      </View>
      <Text style={s.label}>
        <Text style={{ fontFamily: font.semibold, color: c.ink }}>{weekday}, {shortDate(dt)}</Text>
        {'   '}{[state, p.inRange ? `Week ${p.week}` : null, p.inRange ? phaseName : null].filter(Boolean).join(' · ')}
      </Text>
      {strip && <WeekStrip />}
    </View>
  );
}
