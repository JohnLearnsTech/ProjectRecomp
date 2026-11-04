// Today: a short form of the weekly review. The last grade, headline and first commitment, and
// this week's live numbers so far. Tap opens the full review on Progress.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { reviewDue } from '../domain/ai';
import { d, shortDate } from '../domain/dates';
import { proteinFloor } from '../domain/plan';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';
import { useQuests } from '../lib/game';
import { Icon } from './Icon';

export function WeekCard() {
  const { engine, maxDay, touch } = useRecomp();
  const q = useQuests();
  const { D, loaded } = useDays();
  const { c, s } = useTheme('body');
  const review = q.review;
  if (!loaded) return null;
  const st = D.weekStats(maxDay, proteinFloor(engine.PROFILE, engine.G));
  const n = st.daysInWeek || 7;
  const o = review?.out;
  const due = reviewDue(engine.T.START, maxDay, review?.end_date ?? null);
  const gradeBg = (g: string) => (g[0] === 'A' || g[0] === 'B' ? c.cat.habit.fill : g[0] === 'C' ? c.cat.food.fill : c.warn);
  // Each tile is on track, short, or not counted yet.
  const tiles: [string, string, boolean | null][] = [
    ['Sessions', st.liftScheduled ? `${st.liftDone} of ${st.liftScheduled}` : 'none due', st.liftScheduled ? st.liftDone >= st.liftScheduled : null],
    ['Protein floor', `${st.proteinFloorDays} of ${n} days`, st.foodDays ? st.proteinFloorDays >= n - 1 : null],
    ['Steps target', `${st.stepsHitDays} of ${n} days`, st.stepsDays ? st.stepsHitDays >= n - 1 : null],
    ['Food logged', `${st.foodDays} of ${n} days`, st.foodDays >= n - 1],
  ];
  return (
    <Pressable style={s.card} onPress={() => router.navigate({ pathname: '/progress', params: { at: 'review' } })} accessibilityRole="button" accessibilityLabel="This week. Open the weekly review">
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={s.cardTitle}>This week</Text>
        <Text style={s.label}>last 7 days</Text>
      </View>
      {o ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {!!o.grade && <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: gradeBg(o.grade), alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Last grade ${o.grade}`}>
            <Text style={{ fontFamily: font.bold, fontSize: 22, color: '#101210' }}>{o.grade}</Text></View>}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 15.5, lineHeight: 20, color: c.ink }} numberOfLines={2}>{o.headline}</Text>
            <Text style={s.label}>Review of {shortDate(d(review!.start_date))} – {shortDate(d(review!.end_date))}</Text>
          </View>
        </View>
      ) : <Text style={s.body2}>No weekly review yet. Claude grades your week and sets three non-negotiables.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map(([k, v, ok]) => (
          <View key={k} style={{ width: '48.5%', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: ok === false ? c.danger : c.lineSoft, backgroundColor: c.surface2 }}>
            <Text style={{ fontFamily: font.regular, fontSize: 12, color: c.ink2 }}>{k}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 15, color: ok === false ? c.danger : ok ? c.cat.body.ink : c.muted }}>{v}</Text>
          </View>
        ))}
      </View>
      {q.list.length > 0 && (
        <View style={{ borderRadius: 12, padding: 12, backgroundColor: c.cat.body.soft, gap: 8 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.cat.body.ink }}>{q.live ? "This week's quests" : 'Last review’s non-negotiables'}</Text>
          {q.list.map((t, i) => {
            const done = q.done[i];
            return (
              <Pressable key={i} disabled={!q.live} onPress={() => db.setCheck(q.end!, 'quest:' + i, !done).then(() => { touch(); }).catch(() => {})}
                accessibilityRole="checkbox" accessibilityState={{ checked: done }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: done ? c.cat.body.fill : c.cat.body.ink, backgroundColor: done ? c.cat.body.fill : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1, opacity: q.live ? 1 : 0.5 }}>
                  {done && <Icon name="check" size={13} stroke={3} color={c.cat.body.on} />}
                </View>
                <Text style={[s.body, { flex: 1, fontFamily: font.semibold }, done && { color: c.ink2, textDecorationLine: 'line-through' }]}>{t}</Text>
              </Pressable>
            );
          })}
          {q.live && q.done.every(Boolean) && <Text style={{ fontFamily: font.bold, fontSize: 12.5, color: c.cat.body.ink }}>All kept. That earns Promises kept.</Text>}
        </View>
      )}
      <Text style={[s.label, { color: c.cat.body.ink, fontFamily: font.semibold }]}>{due ? 'A new review is due. Open it on Progress ›' : 'Full review on Progress ›'}</Text>
    </Pressable>
  );
}
