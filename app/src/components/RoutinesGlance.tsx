// Today's short view of Routines: habits met, routines done, what is next or overdue, and a
// running habit timer. Tap opens the Routines tab.
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { habitMet } from '../domain/days';
import { clock12 } from '../domain/routines';
import { useDays } from '../lib/days';
import { allTimers, timerMs, useNow, useTimerStore } from '../lib/habitTimers';
import { useRecomp } from '../lib/recomp';
import { useRoutines } from '../lib/routines';
import { font, useTheme } from '../lib/theme';
import { fmtDur } from '../domain/training';

export function RoutinesGlance() {
  const { maxDay, day } = useRecomp();
  const { D, habits, loaded } = useDays();
  const { c, s } = useTheme('habit');
  const R = useRoutines();
  const { timers } = useTimerStore();
  useNow(Object.values(timers).some((x) => x?.running));
  if (!loaded || day !== maxDay) return null;
  const met = habits.filter((h) => { const v = D.habitVal(maxDay, h.id); return v != null && habitMet(h, v); }).length;
  const due = R.today, done = due.filter((x) => x.done).length, late = due.filter((x) => x.late);
  const next = due.find((x) => !x.done && !x.late && x.time);
  const t = allTimers(), tid = Object.keys(t).find((k) => t[k]?.running);
  const total = habits.length + due.length, all = met + done;
  if (!total) return (
    <Pressable style={s.card} onPress={() => router.navigate('/routines')}>
      <Text style={s.cardTitle}>Routines</Text>
      <Text style={s.body2}>Add habits, medicines with reminders, or a skincare or dental routine with its steps. ›</Text>
    </Pressable>
  );
  return (
    <Pressable style={[s.card, { gap: 10 }]} onPress={() => router.navigate('/routines')} accessibilityRole="button" accessibilityLabel={`Routines: ${all} of ${total} done today. Open Routines`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={s.cardTitle}>Routines</Text>
        <Text style={s.label}><Text style={{ fontFamily: font.bold, color: c.ink }}>{all} of {total}</Text> done today</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: Math.min(total, 24) }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < all ? c.cat.habit.fill : c.lineSoft }} />)}
      </View>
      <View style={{ gap: 4 }}>
        {tid && <Text style={[s.body, { fontFamily: font.semibold, color: c.cat.habit.ink }]}>● {habits.find((h) => h.id === tid)?.name ?? 'Timer'} running · {fmtDur(timerMs(tid))}</Text>}
        {late.length > 0 && <Text style={[s.body, { color: c.warn, fontFamily: font.semibold }]}>Overdue: {late.map((x) => x.r.name + (x.time ? ` (${clock12(x.time)})` : '')).join(', ')}</Text>}
        {next && <Text style={s.body2}>Next: <Text style={{ fontFamily: font.semibold, color: c.ink }}>{next.r.name}</Text> at {clock12(next.time!)}</Text>}
        {habits.length > 0 && <Text style={s.body2}>Habits {met} of {habits.length}{due.length ? ` · routines ${done} of ${due.length}` : ''}</Text>}
      </View>
      <Text style={[s.label, { color: c.cat.habit.ink, fontFamily: font.semibold }]}>Open Routines ›</Text>
    </Pressable>
  );
}
