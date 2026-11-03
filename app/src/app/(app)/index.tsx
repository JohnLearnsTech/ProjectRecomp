import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDayLog, getProfile, localDayKey, saveDayFields, type DayFields, type DayLog } from '../../lib/db';
import { useTheme } from '../../lib/theme';

// Step 1 of the build plan: Today with the quick-log fields only, on the real day_logs table.
// Hero card, habits and consistency arrive with step 2.

type Field = { key: keyof DayFields; label: string; unit: string; int?: boolean; min: number; max: number };
const FIELDS: Field[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', min: 20.1, max: 399 },
  { key: 'steps', label: 'Steps', unit: 'steps', int: true, min: 0, max: 200000 },
  { key: 'sleep_h', label: 'Sleep', unit: 'h', min: 0, max: 24 },
  { key: 'waist_cm', label: 'Waist', unit: 'cm', min: 40, max: 250 },
];

export default function Today() {
  const { c, s } = useTheme();
  const today = localDayKey();
  const [log, setLog] = useState<DayLog | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [name, setName] = useState<string | null>(null);
  const [waistDay, setWaistDay] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([getDayLog(today), getProfile()]);
      setLog(d);
      setName(p?.name ?? null);
      setWaistDay(p?.waist_weekday ?? 1);
      setVals(Object.fromEntries(FIELDS.map((f) => [f.key, d?.[f.key] == null ? '' : String(d[f.key])])));
    } catch (e) {
      setMsg({ t: (e as Error).message, err: true });
    }
  }, [today]);
  useEffect(() => { load(); }, [load]);

  const isWaistDay = new Date().getDay() === waistDay;
  const shown = FIELDS.filter((f) => f.key !== 'waist_cm' || isWaistDay || log?.waist_cm != null);

  const save = async () => {
    const patch: DayFields = {};
    for (const f of shown) {
      const raw = (vals[f.key] ?? '').trim().replace(',', '.');
      if (raw === '') { (patch as Record<string, null>)[f.key] = null; continue; }
      const n = f.int ? Math.round(Number(raw)) : Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) return setMsg({ t: `${f.label} looks off.`, err: true });
      (patch as Record<string, number>)[f.key] = n;
    }
    setBusy(true);
    try {
      await saveDayFields(today, patch);
      setMsg({ t: 'Saved.' });
      await load();
    } catch (e) {
      setMsg({ t: (e as Error).message, err: true });
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={s.screen} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={s.label}>{dateLabel}</Text>
            <Text style={s.title}>Today</Text>
          </View>
          <Link href="/me" asChild>
            <Pressable
              accessibilityLabel="Me"
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={[s.section, { fontSize: 17 }]}>{(name?.[0] ?? '·').toUpperCase()}</Text>
            </Pressable>
          </Link>
        </View>

        <View style={s.card}>
          <Text style={s.section}>Quick log</Text>
          {shown.map((f, i) => (
            <View key={f.key} style={{ gap: 12 }}>
              {i > 0 && <View style={s.hairline} />}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={[s.body, { flex: 1 }]}>{f.label}</Text>
                <TextInput
                  style={[s.input, { width: 120, textAlign: 'right' }]}
                  keyboardType={f.int ? 'number-pad' : 'decimal-pad'}
                  value={vals[f.key] ?? ''}
                  onChangeText={(v) => setVals((o) => ({ ...o, [f.key]: v }))}
                  placeholderTextColor={c.muted}
                />
                <Text style={[s.label, { width: 40 }]}>{f.unit}</Text>
              </View>
            </View>
          ))}
          <Pressable style={[s.primary, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}>
            <Text style={s.primaryText}>{busy ? 'Saving…' : 'Save'}</Text>
          </Pressable>
          {msg && <Text style={msg.err ? s.error : s.label}>{msg.t}</Text>}
        </View>

        {log?.kcal_total != null && (
          <View style={s.card}>
            <Text style={s.section}>Food so far</Text>
            <Text style={s.body}>
              {log.kcal_total.toLocaleString('en-IN')} kcal · {log.protein_total_g ?? 0} g protein
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
