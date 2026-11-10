// The lift-day card on Today and Train, built on what gets people started (see README, "Getting
// started on lift days"):
// - the default is the 10-minute version, the floor, so starting is cheap;
// - the person's own trigger ("before my walk at 10:30"), with a backup and a wiped-day fallback;
// - "don't miss twice": one missed lift is shrugged off, a comeback counts double;
// - lifts this week, so a skipped session is visible where they look every day.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { addKey, mondayOf } from '../domain/dates';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { cancelTrainDay, rescheduleSaved } from '../lib/reminders';
import { font, useTheme } from '../lib/theme';
import { toast } from '../lib/toast';
import { fmt12, loadCue, loadWo, saveCue, shiftTime, type Cue } from '../lib/workout';
import { Mini } from './ui';

const okTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function LiftPlan() {
  const { engine, day, maxDay, touch } = useRecomp();
  const { D, entries } = useDays();
  const { c, s } = useTheme('train');
  const [cue, setCue] = useState<Cue | null>(loadCue());
  const [edit, setEdit] = useState(false);
  const P = engine.plan(day);
  const isToday = day === maxDay;
  const trained = D.trainedOn(day), warmed = !!entries[day]?.checks?.warmup;
  useEffect(() => { if (isToday && trained) cancelTrainDay(day).catch(() => {}); }, [isToday, trained, day]);
  if (P.type !== 'lift' || !P.inRange || day > maxDay) return null;

  // Lift days this week (Monday to Sunday) and how many are done.
  const mon = mondayOf(day), week: { k: string; done: boolean; past: boolean }[] = [];
  for (let i = 0; i < 7; i++) { const k = addKey(mon, i); if (engine.plan(k).type === 'lift') week.push({ k, done: D.trainedOn(k), past: k < day }); }
  // The last two lift days before this one, for "don't miss twice".
  const prior: boolean[] = [];
  for (let k = addKey(day, -1); k >= engine.T.START && prior.length < 2; k = addKey(k, -1)) if (engine.plan(k).type === 'lift') prior.push(D.trainedOn(k) || !!entries[k]?.checks?.warmup);
  const missed = prior.length > 0 && !prior[0], missedTwice = prior.length > 1 && !prior[0] && !prior[1];

  const wo = loadWo(), live = !!wo && wo.day === day && wo.session === P.session && !wo.done;
  const warmOnly = async () => {
    try { await db.setCheck(day, 'warmup', true); touch(); toast('Warm-up logged. Today still counts. Two exercises next time.'); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <View style={{ gap: 10 }}>
      {trained ? (
        <>
          <Row done title={isToday ? 'Lifted today' : 'Lifted'} text={cue && isToday ? `Done. Go enjoy your ${cue.anchor}.` : 'Done. That counts.'} />
          <Mini label={live ? 'Resume session' : 'Open session mode'} onPress={() => router.push('/session')} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : (
        <>
          {missedTwice ? <Note text="The last two lift days slipped. Today breaks the run, and a comeback day counts double." />
            : missed ? <Note text="Missed last time? One miss doesn’t count. Two in a row starts to. Today counts double." /> : null}
          {cue ? (
            <Pressable onPress={() => setEdit(true)} accessibilityLabel="Change when you lift">
              <Text style={[s.body, { fontFamily: font.semibold }]}>Before your {fmt12(cue.at)} {cue.anchor}: two exercises.</Text>
              <Text style={s.label}>{cue.backup ? `Missed it? Before your ${fmt12(cue.backup)} ${cue.anchor}. ` : ''}Wiped? The warm-up alone keeps the day. <Text style={{ textDecorationLine: 'underline' }}>Change</Text></Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setEdit(true)} style={[s.outline, { alignSelf: 'flex-start' }]} accessibilityRole="button">
              <Text style={s.outlineText}>Pick when you’ll lift</Text>
            </Pressable>
          )}
          {warmed && <Row done title="Warm-up done" text="Today counts. If you have two exercises in you, they’re below." />}
          <Pressable style={[s.primary, { backgroundColor: c.cat.train.fill }]} onPress={() => router.push(live ? '/session' : '/session?short=1')} accessibilityRole="button">
            <Text style={[s.primaryText, { color: c.cat.train.on }]}>▶  {live ? 'Resume session' : '10 minutes: two exercises'}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {!live && <Mini label="Full session" onPress={() => router.push('/session')} />}
            {!warmed && <Mini label="Wiped? Warm-up only" onPress={warmOnly} />}
          </View>
        </>
      )}
      {week.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.label}>Lifts this week</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {week.map((w) => <View key={w.k} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: w.done ? c.cat.train.fill : 'transparent', borderWidth: 1.5, borderColor: w.done ? c.cat.train.fill : w.past ? c.warn : c.line }} />)}
          </View>
          <Text style={[s.label, { fontFamily: font.semibold, color: c.ink }]}>{week.filter((w) => w.done).length} of {week.length}</Text>
        </View>
      )}
      {edit && <CueEditor cue={cue} onClose={() => setEdit(false)} onSaved={(x) => { setCue(x); setEdit(false); }} />}
    </View>
  );

  function Row({ title, text, done }: { title: string; text: string; done?: boolean }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.cat.train.fill : c.lineSoft }}>
          <Text style={{ color: done ? c.cat.train.on : c.muted, fontSize: 13, fontFamily: font.bold }}>{done ? '✓' : '·'}</Text>
        </View>
        <View style={{ flex: 1 }}><Text style={[s.body, { fontFamily: font.semibold }]}>{title}</Text><Text style={s.body2}>{text}</Text></View>
      </View>
    );
  }
  function Note({ text }: { text: string }) {
    return <View style={{ backgroundColor: c.cat.train.soft, borderRadius: 12, padding: 12 }}><Text style={[s.body2, { color: c.cat.train.ink }]}>{text}</Text></View>;
  }
}

const ANCHORS = ['walk', 'shower', 'first game', 'dinner'];

/** "Before my ___ at __:__. If I miss it, before my ___ at __:__." Reminders go 15 minutes before each. */
function CueEditor({ cue, onClose, onSaved }: { cue: Cue | null; onClose: () => void; onSaved: (c: Cue) => void }) {
  const { engine, maxDay } = useRecomp();
  const { c, s } = useTheme('train');
  const [anchor, setAnchor] = useState(cue?.anchor ?? 'walk');
  const [at, setAt] = useState(cue?.at ?? '10:30');
  const [backup, setBackup] = useState(cue?.backup ?? '18:00');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const a = anchor.trim().toLowerCase().replace(/^(my|the)\s+/, '').slice(0, 30);
    if (!a) return toast('Say what you do it before');
    if (!okTime(at) || (backup.trim() && !okTime(backup.trim()))) return toast('Times as HH:MM, like 10:30 or 18:00');
    const x: Cue = { anchor: a, at, backup: backup.trim() || null };
    setBusy(true);
    try {
      saveCue(x);
      await db.setReminder({ key: 'train', enabled: true, local_time: shiftTime(x.at, -15) });
      await db.setReminder({ key: 'train2', enabled: !!x.backup, local_time: shiftTime(x.backup ?? '18:00', -15) });
      if (Platform.OS !== 'web') { await rescheduleSaved(engine, maxDay); toast(`Saved. You’ll get a nudge at ${fmt12(shiftTime(x.at, -15))}${x.backup ? ` and, if needed, ${fmt12(shiftTime(x.backup, -15))}` : ''}.`); }
      else toast('Saved. Reminders are set from the Android app.');
      onSaved(x);
    } catch (e) { saveCue(x); onSaved(x); toast((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 }}>
        <Text style={s.cardTitle}>When will you lift?</Text>
        <Text style={s.label}>Tie it to something you already do every day. People who decide the when and where in advance follow through far more often.</Text>
        <Text style={[s.label, { fontFamily: font.semibold }]}>Before my…</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ANCHORS.map((a) => (
            <Pressable key={a} onPress={() => setAnchor(a)} accessibilityState={{ selected: anchor === a }}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: anchor === a ? c.ink : c.surface2 }}>
              <Text style={{ fontFamily: font.medium, color: anchor === a ? c.paper : c.ink2 }}>{a}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={s.input} value={anchor} onChangeText={setAnchor} placeholder="or type your own" placeholderTextColor={c.muted} accessibilityLabel="Before my" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.label}>Usually at</Text>
            <TextInput style={[s.input, { textAlign: 'center' }]} value={at} onChangeText={setAt} maxLength={5} keyboardType="numbers-and-punctuation" accessibilityLabel="Usual time" />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.label}>Backup, if I miss it</Text>
            <TextInput style={[s.input, { textAlign: 'center' }]} value={backup} onChangeText={setBackup} maxLength={5} placeholder="none" placeholderTextColor={c.muted} keyboardType="numbers-and-punctuation" accessibilityLabel="Backup time" />
          </View>
        </View>
        <Text style={s.label}>A reminder comes 15 minutes before each. The backup is skipped once you’ve trained.</Text>
        <Pressable style={[s.primary, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}><Text style={s.primaryText}>{busy ? 'Saving…' : 'Save'}</Text></Pressable>
      </View>
    </Modal>
  );
}
