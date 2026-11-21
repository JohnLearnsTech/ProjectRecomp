// Add or edit a routine: its type, name, steps (typed like food: commas or new lines), times,
// how often, and for medicines the dose and an optional end date.
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { clock12, DOSE_PRESETS, DOW, KINDS, parseTime, splitSteps, TEMPLATES, type Freq, type Routine, type RoutineKind } from '../domain/routines';
import { localKey } from '../domain/dates';
import { addRoutine, archiveRoutine, routinesChanged, syncRoutineReminders, updateRoutine } from '../lib/routines';
import { toast } from '../lib/toast';
import * as Notifications from 'expo-notifications';
import { font, useTheme } from '../lib/theme';

export function RoutineSheet({ edit, kind0, onClose }: { edit: Routine | null; kind0: RoutineKind; onClose: () => void }) {
  const { c, s } = useTheme('habit');
  const [kind, setKind] = useState<RoutineKind>(edit?.kind ?? kind0);
  const [name, setName] = useState(edit?.name ?? '');
  const [dose, setDose] = useState(edit?.dose ?? '');
  const [steps, setSteps] = useState((edit?.steps ?? []).join('\n'));
  const [times, setTimes] = useState<string[]>(edit?.times ?? []);
  const [tIn, setTIn] = useState('');
  const [freq, setFreq] = useState<Freq>(edit?.freq ?? 'daily');
  const [days, setDays] = useState<number[]>(edit?.days?.length ? edit.days : [1, 2, 3, 4, 5]);
  const [everyN, setEveryN] = useState(String(edit?.every_n ?? 2));
  const [end, setEnd] = useState(edit?.end_date ?? '');
  const [note, setNote] = useState(edit?.note ?? '');
  const [remind, setRemind] = useState(edit?.remind ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const med = kind === 'medicine' || kind === 'supplement';

  const addTime = (raw = tIn) => {
    const t = parseTime(raw); if (!t) return setErr('Time as 9:30, 21:30 or 9:30 pm.');
    setErr(null); setTIn(''); setTimes((x) => [...new Set([...x, t])].sort().slice(0, 8));
  };
  const save = async () => {
    const n = name.trim();
    if (!n) return setErr('Give it a name.');
    if (freq === 'days' && !days.length) return setErr('Pick at least one day.');
    const ev = Math.round(+everyN); if (freq === 'every' && !(ev >= 2 && ev <= 60)) return setErr('Every 2 to 60 days.');
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end.trim())) return setErr('End date as YYYY-MM-DD, or leave it empty.');
    const pending = parseTime(tIn); const tt = pending ? [...new Set([...times, pending])].sort() : times;
    const row = { kind, name: n.slice(0, 60), steps: splitSteps(steps), times: tt, freq, days: freq === 'days' ? days : [], every_n: freq === 'every' ? ev : null,
      start_date: edit?.start_date ?? localKey(), end_date: end.trim() || null, dose: med ? dose.trim().slice(0, 60) || null : null, note: note.trim().slice(0, 200) || null, remind };
    setBusy(true);
    try {
      if (edit) await updateRoutine(edit.id, row); else await addRoutine(row);
      if (remind && tt.length && Platform.OS !== 'web') await Notifications.requestPermissionsAsync().catch(() => {});
      routinesChanged(); syncRoutineReminders(); onClose();
      toast(edit ? 'Routine saved' : `${n} added${remind && tt.length ? ' · reminders on' : ''}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!edit) return;
    await archiveRoutine(edit.id); routinesChanged(); syncRoutineReminders(); onClose();
    toast(`Removed ${edit.name}`, async () => { await archiveRoutine(edit.id, false); routinesChanged(); syncRoutineReminders(); });
  };

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ minHeight: 38, paddingHorizontal: 13, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: on ? c.cat.habit.fill : c.line, backgroundColor: on ? c.cat.habit.soft : c.surface }}>
      <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: on ? c.cat.habit.ink : c.ink2 }}>{label}</Text>
    </Pressable>
  );
  const L = ({ children }: { children: string }) => <Text style={{ fontFamily: font.bold, fontSize: 12, color: c.ink2, marginBottom: -4 }}>{children}</Text>;
  const tpl = !edit ? TEMPLATES[kind] : [];

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <ScrollView style={{ maxHeight: '92%', backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 36, gap: 14 }}>
          <View style={{ alignItems: 'center' }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 18, color: c.ink }}>{edit ? 'Edit routine' : 'New routine'}</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: c.ink2 }}>✕</Text>
            </Pressable>
          </View>

          <L>Type</L>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{KINDS.map((k) => <Chip key={k.k} on={kind === k.k} label={`${k.icon} ${k.one}`} onPress={() => setKind(k.k)} />)}</View>

          {tpl.length > 0 && (
            <>
              <L>Start from</L>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tpl.map((t) => <Chip key={t.name} on={name === t.name} label={t.name} onPress={() => { setName(t.name); setSteps(t.steps.join('\n')); setTimes(t.times); }} />)}
              </View>
            </>
          )}

          <L>{med ? 'Name' : 'Name'}</L>
          <TextInput style={s.input} value={name} onChangeText={setName} maxLength={60} placeholder={med ? 'Metformin, Vitamin D…' : 'Night skincare'} placeholderTextColor={c.muted} accessibilityLabel="Name" />
          {med && (
            <>
              <L>Dose (as prescribed)</L>
              <TextInput style={s.input} value={dose} onChangeText={setDose} maxLength={60} placeholder="500 mg, 1 tablet, 5 ml…" placeholderTextColor={c.muted} accessibilityLabel="Dose" />
            </>
          )}

          <L>{med ? 'Notes or steps (optional)' : 'Steps, in order'}</L>
          <TextInput style={[s.input, { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }]} multiline value={steps} onChangeText={setSteps}
            placeholder={med ? 'After food, with water' : 'Cleanser, toner, moisturiser, sunscreen'} placeholderTextColor={c.muted} accessibilityLabel="Steps" />
          {!!steps.trim() && <Text style={[s.label, { marginTop: -6 }]}>{splitSteps(steps).length} step{splitSteps(steps).length === 1 ? '' : 's'}: one per line or comma.</Text>}

          <L>How often</L>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {([['daily', 'Every day'], ['days', 'Some days'], ['every', 'Every few days'], ['asneeded', 'As needed']] as [Freq, string][]).map(([k, l]) => <Chip key={k} on={freq === k} label={l} onPress={() => setFreq(k)} />)}
          </View>
          {freq === 'days' && (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 0].map((i) => (
                <Pressable key={i} onPress={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} accessibilityLabel={DOW[i]} accessibilityState={{ selected: days.includes(i) }}
                  style={{ flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: days.includes(i) ? c.cat.habit.fill : c.line, backgroundColor: days.includes(i) ? c.cat.habit.soft : c.surface }}>
                  <Text style={{ fontFamily: font.semibold, fontSize: 13, color: days.includes(i) ? c.cat.habit.ink : c.ink2 }}>{DOW[i].slice(0, 2)}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {freq === 'every' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={s.body}>Every</Text>
              <TextInput style={[s.input, { width: 70, textAlign: 'center' }]} value={everyN} onChangeText={setEveryN} keyboardType="number-pad" maxLength={2} accessibilityLabel="Every how many days" />
              <Text style={s.body}>days, starting {edit ? 'from when it was added' : 'today'}</Text>
            </View>
          )}

          {freq !== 'asneeded' && (
            <>
              <L>{med ? 'Times to take it' : 'Time'}</L>
              {med && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{DOSE_PRESETS.map((p) => <Chip key={p.label} on={times.join() === p.times.join()} label={p.label} onPress={() => setTimes(p.times)} />)}</View>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {times.map((t) => (
                  <Pressable key={t} onPress={() => setTimes((x) => x.filter((y) => y !== t))} accessibilityLabel={`Remove ${clock12(t)}`}
                    style={{ minHeight: 38, paddingHorizontal: 13, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.cat.habit.soft }}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 14, color: c.cat.habit.ink }}>{clock12(t)}</Text><Text style={{ color: c.cat.habit.ink, fontSize: 13 }}>✕</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.input, { flex: 1 }]} value={tIn} onChangeText={setTIn} onSubmitEditing={() => addTime()} placeholder="Add a time: 9:30 pm" placeholderTextColor={c.muted} accessibilityLabel="Add a time" />
                <Pressable style={[s.outline, { minHeight: 48 }]} onPress={() => addTime()}><Text style={s.outlineText}>Add</Text></Pressable>
              </View>
              {!times.length && <Text style={[s.label, { marginTop: -6 }]}>No time means any time of day, with no reminder.</Text>}
            </>
          )}

          {med && (
            <>
              <L>Last day (optional, for a course)</L>
              <TextInput style={s.input} value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} maxLength={10} accessibilityLabel="Last day" />
            </>
          )}
          <L>Note (optional)</L>
          <TextInput style={s.input} value={note} onChangeText={setNote} maxLength={200} placeholder={med ? 'Prescribed by…, refill on…' : 'Anything to remember'} placeholderTextColor={c.muted} accessibilityLabel="Note" />

          {freq !== 'asneeded' && (
            <Pressable onPress={() => setRemind(!remind)} accessibilityRole="checkbox" accessibilityState={{ checked: remind }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: remind ? c.cat.habit.fill : c.muted, backgroundColor: remind ? c.cat.habit.fill : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {remind && <Text style={{ color: c.cat.habit.on, fontSize: 13, fontFamily: font.bold }}>✓</Text>}
              </View>
              <Text style={[s.body, { flex: 1 }]}>Remind me at {times.length ? times.map(clock12).join(', ') : 'each time'}</Text>
            </Pressable>
          )}
          {med && <Text style={s.label}>Recomp only reminds you. Take medicines as your doctor prescribed; it does not check doses or interactions.</Text>}
          {err && <Text style={s.error}>{err}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {edit && <Pressable style={[s.outline, { minHeight: 52 }]} onPress={remove}><Text style={[s.outlineText, { color: c.danger }]}>Remove</Text></Pressable>}
            <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}><Text style={s.primaryText}>{busy ? 'Saving…' : edit ? 'Save' : 'Add routine'}</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
