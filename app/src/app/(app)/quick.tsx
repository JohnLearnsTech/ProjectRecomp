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
import { Icon } from '../../components/Icon';

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

  const go = (fn: () => void) => { router.back(); fn(); };
  const GoRow = ({ icon, t, sub, onPress }: { icon: string; t: string; sub: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.lineSoft, backgroundColor: c.surface2 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.cat.move.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} color={c.cat.move.ink} stroke={1.9} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: font.bold, fontSize: 15, color: c.ink }}>{t}</Text><Text style={s.label}>{sub}</Text></View>
    </Pressable>
  );
  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 20, gap: 12, backgroundColor: c.surface }}>
      <View style={{ alignItems: 'center' }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 18, color: c.ink }}>Log for {day === maxDay ? 'today' : shortDate(d(day))}</Text>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, color: c.ink2 }}>✕</Text>
        </Pressable>
      </View>
      {future && <Text style={s.body2}>This day hasn't happened yet, so logging is off.</Text>}
      {!future && P.waistDay && <Text style={s.label}>{WEEKDAY_NAMES[waistWeekday(engine.PROFILE)]}: waist day.</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {shown.map((f) => (
          <View key={f.key} style={{ flex: 1, gap: 5 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink2 }}>{f.label}{f.unit === 'steps' ? '' : ` (${f.unit})`}</Text>
            <TextInput style={s.input} keyboardType={f.int ? 'number-pad' : 'decimal-pad'} value={vals[f.key] ?? ''} editable={!future} accessibilityLabel={f.label}
              placeholder={f.key === 'steps' ? '8000' : f.key === 'sleep_h' ? '7.5' : f.unit} placeholderTextColor={c.muted} onChangeText={(v) => setVals((o) => ({ ...o, [f.key]: v }))} />
          </View>
        ))}
      </View>
      <Pressable style={[s.primary, (busy || future) && { opacity: 0.5 }]} disabled={busy || future} onPress={save}>
        <Text style={s.primaryText}>{busy ? 'Saving…' : 'Save'}</Text>
      </Pressable>
      {msg && <Text style={s.error}>{msg}</Text>}
      <View style={s.hairline} />
      <Text style={s.label}>Habits</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {habits.length ? habits.map((h) => {
          const v = D.habitVal(day, h.id), ok = v != null && habitMet(h, v);
          return (
            <Pressable key={h.id} onPress={() => go(() => router.navigate({ pathname: '/', params: { habit: h.id } }))}
              style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: ok ? c.cat.move.soft : c.line, backgroundColor: ok ? c.cat.move.soft : c.surface }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 14, color: ok ? c.cat.move.ink : c.ink }}>{ok ? '✓ ' : ''}{h.name}</Text>
            </Pressable>
          );
        }) : <Text style={s.label}>No habits yet. Add one on Today.</Text>}
      </View>
      <View style={s.hairline} />
      <Text style={s.label}>Go to</Text>
      <GoRow icon="nav-food" t="Log a meal" sub="Type it in plain words, or scan a label" onPress={() => go(() => router.navigate({ pathname: '/food', params: { focus: '1' } }))} />
      <GoRow icon="nav-workout" t="Log sets" sub="Today's session" onPress={() => go(() => router.navigate('/train'))} />
    </View>
  );
}
