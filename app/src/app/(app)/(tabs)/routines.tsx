// Routines: habits (with their timers) and everything done on a schedule, in sections by type.
// Each routine shows its times for the day as ticks; one with steps opens into a checklist.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Habits } from '../../../components/Habits';
import { RoutineSheet } from '../../../components/RoutineSheet';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { d, shortDate } from '../../../domain/dates';
import { clock12, dueOn, freqText, KINDS, nextDue, slotsOf, type Routine, type RoutineKind } from '../../../domain/routines';
import { useRecomp } from '../../../lib/recomp';
import { routinesChanged, setRoutineLog, useRoutines } from '../../../lib/routines';
import { font, useTheme } from '../../../lib/theme';

export default function Routines() {
  const { day, maxDay, refresh } = useRecomp();
  const { c, s } = useTheme('habit');
  const { habit, stop } = useLocalSearchParams<{ habit?: string; stop?: string }>();
  const R = useRoutines();
  const [sheet, setSheet] = useState<{ edit: Routine | null; kind: RoutineKind } | null>(null);
  const future = day > maxDay;
  const due = R.slotsFor(day), doneN = due.filter((x) => x.done).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={s.screen} refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refresh(); R.reload(); }} />}>
        <ScreenHeader title="Routines" cat="habit" />
        {due.length > 0 && (
          <Text style={s.label}>{day === maxDay ? 'Today' : shortDate(d(day))}: <Text style={{ fontFamily: font.bold, color: c.ink }}>{doneN} of {due.length}</Text> routine{due.length === 1 ? '' : 's'} done{due.some((x) => x.late) ? ` · ${due.filter((x) => x.late).length} overdue` : ''}</Text>
        )}

        <Habits openId={habit} stopId={stop} onOpened={() => router.setParams({ habit: undefined, stop: undefined })} />

        {KINDS.map(({ k, title, icon }) => {
          const list = R.routines.filter((r) => r.kind === k);
          if (!list.length) return null;
          return (
            <View key={k} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[s.cardTitle, { flex: 1 }]}>{icon} {title}</Text>
                <Pressable onPress={() => setSheet({ edit: null, kind: k })} accessibilityLabel={`Add to ${title}`} hitSlop={8}
                  style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20, color: c.ink2, marginTop: -2 }}>+</Text>
                </Pressable>
              </View>
              {list.map((r, i) => <RoutineRow key={r.id} r={r} first={i === 0} day={day} future={future} R={R} onEdit={() => setSheet({ edit: r, kind: r.kind })} />)}
            </View>
          );
        })}

        <View style={[s.card, { gap: 10 }]}>
          <Text style={s.section}>Add a routine</Text>
          <Text style={s.body2}>Medicines with reminder times, a skincare or haircare routine with its steps, dental care, or anything else you do on a schedule.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KINDS.map((k) => (
              <Pressable key={k.k} onPress={() => setSheet({ edit: null, kind: k.k })} style={[s.outline, { minHeight: 42 }]}>
                <Text style={s.outlineText}>{k.icon} {k.one}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      {sheet && <RoutineSheet edit={sheet.edit} kind0={sheet.kind} onClose={() => setSheet(null)} />}
    </SafeAreaView>
  );
}

function RoutineRow({ r, first, day, future, R, onEdit }: { r: Routine; first: boolean; day: string; future: boolean; R: ReturnType<typeof useRoutines>; onEdit: () => void }) {
  const { c, s } = useTheme('habit');
  const [open, setOpen] = useState(false);
  const isDue = dueOn(r, day), asNeeded = r.freq === 'asneeded';
  const slots = R.slotsFor(day).filter((x) => x.r.id === r.id);
  // The slot the checklist works on: the first not done, else the last.
  const cur = slots.find((x) => !x.done) ?? slots[slots.length - 1];
  const mark = async (slot: number, done: boolean, steps: number[]) => { await setRoutineLog(r.id, day, slot, { done, steps }); routinesChanged(); };
  const tickStep = (i: number) => {
    if (!cur) return;
    const have = cur.log?.steps ?? [], next = have.includes(i) ? have.filter((x) => x !== i) : [...have, i];
    mark(cur.slot, next.length >= r.steps.length, next).catch(() => {});
  };
  const nd = !isDue && !asNeeded ? nextDue(r, day) : null;
  const asLog = asNeeded ? R.logOf(r.id, day, 0) : null;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: c.lineSoft, paddingTop: first ? 0 : 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Pressable style={{ flex: 1, gap: 2 }} onPress={() => (r.steps.length ? setOpen(!open) : onEdit())} accessibilityRole="button" accessibilityState={r.steps.length ? { expanded: open } : undefined}>
          <Text style={[s.row16, { fontFamily: font.semibold }]}>{r.name}{r.dose ? <Text style={{ fontFamily: font.regular, color: c.ink2 }}> · {r.dose}</Text> : null}</Text>
          <Text style={s.label}>{freqText(r)}{r.steps.length ? ` · ${r.steps.length} steps ${open ? '▾' : '▸'}` : ''}{!isDue && nd ? ` · next ${nd === day ? 'today' : shortDate(d(nd))}` : ''}</Text>
        </Pressable>
        <Pressable onPress={onEdit} accessibilityLabel={`Edit ${r.name}`} hitSlop={8}><Text style={{ fontFamily: font.semibold, fontSize: 13, color: c.cat.habit.ink }}>Edit</Text></Pressable>
      </View>
      {isDue && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {slots.map((x) => (
            <Pressable key={x.slot} disabled={future} onPress={() => mark(x.slot, !x.done, x.done ? [] : r.steps.map((_, i) => i)).catch(() => {})}
              accessibilityRole="checkbox" accessibilityState={{ checked: x.done }} accessibilityLabel={`${r.name} ${x.time ? clock12(x.time) : ''}`}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1,
                borderColor: x.done ? c.cat.habit.fill : x.late ? c.warn : c.line, backgroundColor: x.done ? c.cat.habit.fill : 'transparent', opacity: future ? 0.5 : 1 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: x.done ? c.cat.habit.on : x.late ? c.warn : c.ink2 }}>{x.done ? '✓' : '○'}</Text>
              <Text style={{ fontFamily: font.semibold, fontSize: 14, color: x.done ? c.cat.habit.on : x.late ? c.warn : c.ink }}>{x.time ? clock12(x.time) : 'Done today'}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {asNeeded && (
        <Pressable disabled={future} onPress={() => mark(0, !asLog?.done, []).catch(() => {})} style={[s.outline, { alignSelf: 'flex-start', minHeight: 40 }]}>
          <Text style={s.outlineText}>{asLog?.done ? `✓ Taken ${asLog.done_at ? new Date(asLog.done_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}` : 'Log it now'}</Text>
        </Pressable>
      )}
      {open && r.steps.length > 0 && (
        <View style={{ gap: 6, backgroundColor: c.surface2, borderRadius: 12, padding: 12 }}>
          {slots.length > 1 && cur && <Text style={s.label}>For {cur.time ? clock12(cur.time) : 'today'}</Text>}
          {r.steps.map((t, i) => {
            const on = !!cur?.log?.steps?.includes(i) || !!cur?.done;
            return (
              <Pressable key={i} disabled={!isDue || future} onPress={() => tickStep(i)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 34 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? c.cat.habit.fill : c.muted, backgroundColor: on ? c.cat.habit.fill : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <Text style={{ color: c.cat.habit.on, fontSize: 12, fontFamily: font.bold }}>✓</Text>}
                </View>
                <Text style={[s.body, { flex: 1 }, on && { color: c.ink2, textDecorationLine: 'line-through' }]}>{i + 1}. {t}</Text>
              </Pressable>
            );
          })}
          {r.note && <Text style={s.label}>{r.note}</Text>}
        </View>
      )}
    </View>
  );
}
