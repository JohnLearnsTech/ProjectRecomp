import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { d, diffDays, shortDate } from '../domain/dates';
import { useRecomp } from '../lib/recomp';
import { font, useTheme, type Category } from '../lib/theme';
import { Icon } from './Icon';
import { WeekStrip } from './WeekStrip';

/** Title, days-to-goal count, Me avatar, the day line and (optionally) the week strip. */
export function ScreenHeader({ title, strip = true, dayLine = true, onMe = false, cat = 'move' }: { title: string; strip?: boolean; dayLine?: boolean; onMe?: boolean; cat?: Category }) {
  const { engine, day, maxDay, error } = useRecomp();
  const { c, s } = useTheme(cat);
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
              <Text style={{ fontFamily: font.bold, fontSize: 21, letterSpacing: -0.8, color: c.cat[cat].ink, lineHeight: 23, fontVariant: ['tabular-nums'] }}>{left}</Text>
              <Text style={{ fontFamily: font.bold, fontSize: 9.5, color: c.muted, marginTop: 3 }}>days to {G.name || 'the goal'}</Text>
            </View>
          )}
          {/* r19 sync dot: accent once the account is reachable, orange when it is not. */}
          <View accessibilityLabel={error ? 'Not connected' : 'Synced'} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: error ? c.warn : c.cat[cat].fill }} />
          <Pressable accessibilityLabel="Me: goal, history and settings" onPress={() => (onMe ? (router.canGoBack() ? router.back() : router.replace('/')) : router.push('/me'))}
            style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: onMe ? c.cat.move.fill : c.line, backgroundColor: onMe ? c.cat.move.fill : c.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="me" size={18} color={onMe ? c.cat.move.on : c.ink2} />
          </Pressable>
        </View>
      </View>
      {dayLine && <Text style={s.label}>
        <Text style={{ fontFamily: font.semibold, color: c.ink }}>{weekday}, {shortDate(dt)}</Text>
        {'   '}{[state, p.inRange ? `Week ${p.week}` : null, p.inRange ? phaseName : null].filter(Boolean).join(' · ')}
      </Text>}
      {strip && <WeekStrip />}
    </View>
  );
}
