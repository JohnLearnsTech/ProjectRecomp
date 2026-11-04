// What the game shows: your level and today's floor on Today, a short celebration when a day is
// won or a level or badge is earned, and the badges on Progress. Points appear only when earned.
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { d, shortDate } from '../domain/dates';
import { floorFor, LEVELS } from '../domain/game';
import { proteinFloor } from '../domain/plan';
import { useDays } from '../lib/days';
import { useGame } from '../lib/game';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';
import { Icon } from './Icon';

const seen = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const mark = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Today: level, progress to the next one, the streak, and today's floor. */
export function GameBar() {
  const g = useGame();
  const { engine, maxDay, day } = useRecomp();
  const { entries, habits, D } = useDays();
  const { c, s } = useTheme('move');
  if (!g) return null;
  const L = g.level, nx = L.next;
  const pct = nx ? ((g.totalWon - L.from) / Math.max(1, nx.at - L.from)) * 100 : 100;
  const f = floorFor(engine, maxDay, entries[maxDay], habits, proteinFloor(engine.PROFILE, engine.G), D.trainedOn(maxDay));
  const won = !!g.today?.won;
  return (
    <View style={[s.card, { gap: 10, paddingVertical: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.cat.move.fill, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.bold, fontSize: 18, color: c.cat.move.on }}>{L.i + 1}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: font.bold, fontSize: 17, color: c.ink }}>{L.name}</Text>
            <Text style={s.label}>{g.streak > 0 ? `${g.streak}-day streak` : `${g.totalWon} days won`}</Text>
          </View>
          <View style={{ height: 7, borderRadius: 999, backgroundColor: c.lineSoft, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.max(3, Math.min(100, pct))}%`, borderRadius: 999, backgroundColor: c.cat.move.fill }} />
          </View>
          <Text style={s.label}>{nx ? `${nx.need} more day${nx.need === 1 ? '' : 's'} won to ${nx.name}` : 'Top level. Keep it.'}</Text>
        </View>
      </View>
      {day === maxDay && f.type !== 'off' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 11, backgroundColor: won ? c.cat.move.soft : c.surface2, borderWidth: 1, borderColor: won ? c.cat.move.fill : c.lineSoft }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: won ? c.cat.move.fill : 'transparent', borderWidth: won ? 0 : 1.5, borderColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
            {won && <Icon name="check" size={13} stroke={3} color={c.cat.move.on} />}
          </View>
          <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: c.ink }}>
            {won ? <Text style={{ fontFamily: font.bold }}>Today is won. </Text> : <Text style={{ fontFamily: font.bold }}>To win today: </Text>}
            {won ? 'Anything more is a bonus.' : f.text}
          </Text>
        </View>
      )}
    </View>
  );
}

/** A short celebration, once per event: a day won, a level up, a new badge. Tap to close. */
export function Celebrate() {
  const g = useGame();
  const { maxDay } = useRecomp();
  const { c } = useTheme('move');
  const [msg, setMsg] = useState<{ title: string; line: string; pts?: number } | null>(null);
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!g || !g.today?.won) return;
    // Only what today itself earned is celebrated, once each: never old history.
    const key = 'recomp:cele:' + maxDay, shown = (seen(key) ?? '').split(',');
    const lvlOf = (n: number) => LEVELS.filter(([t]) => n >= t).length - 1;
    const queue: { id: string; title: string; line: string; pts?: number }[] = [];
    queue.push(g.today.comeback
      ? { id: 'won', title: 'Back on it', line: 'You came back after a miss. That counts double today.', pts: g.today.pts }
      : { id: 'won', title: 'Day won', line: g.streak > 1 ? `${g.streak} days in a row. That's how it's built.` : 'The floor is met. That is the whole job.', pts: g.today.pts });
    if (lvlOf(g.totalWon) > lvlOf(g.totalWon - 1)) queue.push({ id: 'lvl', title: `Level up: ${g.level.name}`, line: `${g.totalWon} days won. Keep stacking them.` });
    g.badges.filter((b) => b.at === maxDay).forEach((b) => queue.push({ id: 'b:' + b.id, title: `Badge: ${b.name}`, line: b.why }));
    const next = queue.find((q) => !shown.includes(q.id));
    if (!next) return;
    mark(key, [...shown.filter(Boolean), next.id].join(','));
    setMsg(next);
    Animated.timing(op, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const t = setTimeout(() => Animated.timing(op, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => setMsg(null)), 4200);
    return () => clearTimeout(t);
  }, [g?.today?.won, g?.level.i, g?.badges.map((b) => b.at).join(), msg == null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!msg) return null;
  return (
    <Animated.View style={{ position: 'absolute', left: 16, right: 16, bottom: 104, opacity: op, transform: [{ translateY: op.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      <Pressable onPress={() => setMsg(null)} accessibilityRole="alert" style={{ backgroundColor: c.pauseBg, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.cat.move.fill, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="star" size={22} color={c.cat.move.on} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 18, color: c.pauseInk }}>{msg.title}</Text>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: c.pauseInk, opacity: 0.8 }}>{msg.line}</Text>
        </View>
        {msg.pts ? <Text style={{ fontFamily: font.bold, fontSize: 20, color: c.cat.move.fill }}>+{msg.pts}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/** Progress: days won, streaks and the badges, earned and still to come. */
export function Badges() {
  const g = useGame();
  const { c, s } = useTheme('body');
  if (!g) return null;
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Days won</Text>
      <View style={{ flexDirection: 'row', gap: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: c.lineSoft, borderWidth: 1, borderColor: c.lineSoft }}>
        {[['Days won', String(g.totalWon), `of ${g.daysIn}`], ['Streak', String(g.streak), 'one miss a week forgiven'], ['Best streak', String(g.best), 'so far']].map(([k, v, n]) => (
          <View key={k} style={{ flex: 1, backgroundColor: c.surface, padding: 12, gap: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: c.muted }}>{k}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 24, color: c.ink }}>{v}</Text>
            <Text style={{ fontFamily: font.regular, fontSize: 11, color: c.muted }}>{n}</Text>
          </View>
        ))}
      </View>
      <Text style={s.label}>A day is won when its floor is met: on lift days the warm-up and two exercises, on cardio days ten minutes of walking, on rest days two of water, protein and a short walk.</Text>
      <Text style={{ fontFamily: font.bold, fontSize: 15, color: c.ink, marginTop: 4 }}>Badges</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {g.badges.map((b) => (
          <View key={b.id} style={{ width: '48.5%', borderRadius: 12, padding: 11, gap: 3, borderWidth: 1, borderColor: b.at ? c.cat.move.fill : c.lineSoft, backgroundColor: b.at ? c.cat.move.soft : c.surface2, opacity: b.at ? 1 : 0.7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="star" size={14} color={b.at ? c.cat.move.ink : c.muted} />
              <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: c.ink, flex: 1 }} numberOfLines={1}>{b.name}</Text>
            </View>
            <Text style={{ fontFamily: font.regular, fontSize: 12, color: c.ink2 }}>{b.why}</Text>
            <Text style={{ fontFamily: font.semibold, fontSize: 11, color: b.at ? c.cat.move.ink : c.muted }}>{b.at ? 'Earned ' + shortDate(d(b.at)) : 'Not yet'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
