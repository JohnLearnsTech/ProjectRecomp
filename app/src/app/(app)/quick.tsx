import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { d, shortDate, WEEKDAY_NAMES } from '../../domain/dates';
import { waistWeekday } from '../../domain/plan';
import * as db from '../../lib/db';
import { habitMet } from '../../domain/days';
import { useDays } from '../../lib/days';
import { useRecomp } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';

// r19 quick-log sheet: the numbers measured once a day, plus doors into food and sets.
// Habit chips join in build step 4.
type F = { key: keyof db.DayFields; label: string; unit: string; int?: boolean; min: number; max: number };
const FIELDS: F[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', min: 20.1, max: 399 },
  { key: 'steps', label: 'Steps', unit: 'steps', int: true, min: 0, max: 200000 },
  { key: 'sleep_h', label: 'Sleep', unit: 'h', min: 0, max: 24 },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', min: 40, max: 250 },
];

export default function Quick() {
  const { engine, day, maxDay, touch } = useRecomp();
  const { c, s } = useTheme('move');
  const insets = useSafeAreaInsets();
  const P = engine.plan(day);
  const { D, habits } = useDays();
  const future = day > maxDay;
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    db.getDayLog(day).then((l) => setVals(Object.fromEntries(FIELDS.map((f) => [f.key, l?.[f.key] == null ? '' : String(l[f.key])])))).catch(() => {});
  }, [day]);

  const shown = FIELDS.filter((f) => f.key !== 'waist_cm' || P.waistDay);

  const save = async () => {
    const patch: db.DayFields = {};
    for (const f of shown) {
      const raw = (vals[f.key] ?? '').trim().replace(',', '.');
      if (raw === '') { (patch as Record<string, null>)[f.key] = null; continue; }
      const v = f.int ? Math.round(Number(raw)) : Number(raw);
      if (!Number.isFinite(v) || v < f.min || v > f.max) return setMsg(`${f.label} looks off.`);
      (patch as Record<string, number>)[f.key] = v;
    }
    setBusy(true);
    try { await db.saveDayFields(day, patch); touch(); router.back(); }
    catch (e) { setMsg((e as Error).message); setBusy(false); }
  };

  return (
    <View style={{ padding: 20, paddingBottom: insets.bottom + 20, gap: 12, backgroundColor: c.surface }}>
      <Text style={s.cardTitle}>Log for {day === maxDay ? 'today' : shortDate(d(day))}</Text>
      {future && <Text style={s.body2}>This day hasn't happened yet, so logging is off.</Text>}
      {!future && P.waistDay && <Text style={s.label}>{WEEKDAY_NAMES[waistWeekday(engine.PROFILE)]}: waist day.</Text>}
      {shown.map((f, i) => (
        <View key={f.key} style={{ gap: 12 }}>
          {i > 0 && <View style={s.hairline} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={[s.row16, { flex: 1 }]}>{f.label}</Text>
            <TextInput
              style={[s.input, { width: 120, textAlign: 'right' }]}
              keyboardType={f.int ? 'number-pad' : 'decimal-pad'}
              value={vals[f.key] ?? ''}
              editable={!future}
              placeholder={f.key === 'steps' ? String(P.steps) : ''}
              placeholderTextColor={c.muted}
              onChangeText={(v) => setVals((o) => ({ ...o, [f.key]: v }))}
            />
            <Text style={[s.label, { width: 40 }]}>{f.unit}</Text>
          </View>
        </View>
      ))}
      <Pressable style={[s.primary, (busy || future) && { opacity: 0.5 }]} disabled={busy || future} onPress={save}>
        <Text style={s.primaryText}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>
      {msg && <Text style={s.error}>{msg}</Text>}
      <View style={s.row}>
        <Pressable style={[s.outline, { flex: 1 }]} onPress={() => { router.back(); router.navigate({ pathname: '/food', params: { focus: '1' } }); }}>
          <Text style={s.outlineText}>Log a meal</Text>
        </Pressable>
        <Pressable style={[s.outline, { flex: 1 }]} onPress={() => { router.back(); router.navigate('/train'); }}>
          <Text style={s.outlineText}>Log sets</Text>
        </Pressable>
      </View>
      <Text style={[s.label, { fontFamily: font.semibold }]}>Habits</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {habits.length ? habits.map((h) => {
          const v = D.habitVal(day, h.id), ok = v != null && habitMet(h, v);
          return (
            <Pressable key={h.id} onPress={() => { router.back(); router.navigate({ pathname: '/', params: { habit: h.id } }); }}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: ok ? c.cat.habit.soft : c.surface2 }}>
              <Text style={{ fontFamily: font.medium, color: ok ? c.cat.habit.ink : c.ink2 }}>{ok ? '✓ ' : ''}{h.name}</Text>
            </Pressable>
          );
        }) : <Text style={s.label}>No habits yet. Add one on Today.</Text>}
      </View>
    </View>
  );
}
