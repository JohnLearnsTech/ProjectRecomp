// Me > Goal (r19 renderGoal, the gSave / msAdd / gNext handlers).
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { addDays, d, diffDays, key, shortDate, todayKey, trimNum } from '../../domain/dates';
import * as db from '../../lib/db';
import { useDays } from '../../lib/days';
import { useRecomp } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';
import { Icon } from '../Icon';
import { Cue, Fold, Label, Meter, Mini, Stats } from '../ui';

const isKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** r19 latestWeight(): the last weigh-in inside the goal window, up to today. */
export function useLatestWeight() {
  const { engine, maxDay } = useRecomp();
  const { entries } = useDays();
  const { START, END } = engine.T;
  const ks = Object.keys(entries).filter((k) => k >= START && k <= END && k <= maxDay && entries[k].w != null).sort();
  return ks.length ? +entries[ks[ks.length - 1]].w! : null;
}

export function GoalTab({ toast }: { toast: (t: string) => void }) {
  const { engine, real, reload, touch } = useRecomp();
  const { c, s } = useTheme('move');
  const { G, T, PL } = engine;
  const now = useLatestWeight();
  const [ms, setMs] = useState<db.MilestoneFull[]>([]);
  const [past, setPast] = useState<db.Goal[]>([]);
  useEffect(() => {
    if (!G.id) return;
    db.listMilestonesFull(G.id).then(setMs).catch(() => {});
    db.listGoals().then((gs) => setPast(gs.filter((g) => g.status === 'done'))).catch(() => {});
  }, [G.id, engine]);

  const elapsed = Math.max(0, Math.min(T.TOTAL, diffDays(d(T.START), d(real)) + 1));
  const left = Math.max(0, diffDays(d(real), d(T.DEPART)));
  let lost = now != null ? T.START_KG - now : 0, toGo = T.START_KG - T.TARGET_KG;
  const tp = T.TOTAL > 0 ? Math.min(100, (elapsed / T.TOTAL) * 100) : 0;
  const movedTxt = now != null ? (lost > 0 ? '-' : '') + trimNum(Math.abs(lost)) + ' kg' : '—';
  if (T.TARGET_KG > T.START_KG) { toGo = T.TARGET_KG - T.START_KG; lost = now != null ? now - T.START_KG : 0; }
  const wp = toGo > 0 ? Math.max(0, Math.min(100, (lost / toGo) * 100)) : 0;

  // Edit this goal
  const str = (v: unknown) => (v == null ? '' : String(v));
  const [f, setF] = useState<Record<string, string>>({});
  const [home, setHome] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    setF({ name: G.name, why: G.why, start: G.start, due: G.due, event: str(G.event), steps: str(G.steps), startKg: str(G.startKg), targetKg: str(G.targetKg), kcal: str(G.kcal), protein: str(G.protein) });
    setHome(!!G.homeFirst);
  }, [G]);
  const field = (k: string, label: string, opts: { numeric?: boolean; placeholder?: string; multiline?: boolean; max?: number } = {}) => (
    <View style={{ gap: 5, flex: 1 }}>
      <Label>{label}</Label>
      <TextInput style={[s.input, opts.multiline && { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 }]} value={f[k] ?? ''} onChangeText={(v) => setF((o) => ({ ...o, [k]: v }))}
        keyboardType={opts.numeric ? 'decimal-pad' : 'default'} placeholder={opts.placeholder} placeholderTextColor={c.muted} multiline={opts.multiline} maxLength={opts.max} accessibilityLabel={label} />
    </View>
  );
  const saveGoal = async () => {
    const n = (k: string) => (f[k]?.trim() ? +f[k].replace(',', '.') : null);
    const st = isKey(f.start?.trim()) ? f.start.trim() : G.start, du = isKey(f.due?.trim()) ? f.due.trim() : G.due;
    if (du <= st) return setNote('The last day has to come after the start.');
    let ev: string | null = isKey(f.event?.trim()) ? f.event.trim() : null, dropped = false;
    if (ev && (ev < du || diffDays(d(du), d(ev)) > 30)) { ev = null; dropped = true; }
    const kcal = n('kcal') || 2200, protein = n('protein') || 180, steps = n('steps') || 8000;
    try {
      await db.updateGoal(G.id, {
        name: f.name?.trim().slice(0, 40) || G.name, why: (f.why ?? '').trim().slice(0, 160), start_date: st, due_date: du, event_date: ev,
        train_start_date: G.trainStart && G.trainStart !== G.start ? G.trainStart : st,
        start_kg: n('startKg'), target_kg: n('targetKg'), kcal: Math.round(kcal), protein_g: Math.round(protein), steps: Math.round(steps), home_first: home,
      });
      // r19: a new starting step target moves every phase of a saved plan by the same amount.
      const cur = await db.getCurrentPlan();
      if (cur?.body && steps !== (G.steps || 8000)) {
        const dl = steps - (G.steps || 8000), body = cur.body as typeof PL;
        body.phases.forEach((ph) => { ph.steps = Math.max(2000, ph.steps + dl); });
        await db.updateCurrentPlanBody(body);
      }
      await reload(); touch();
      setNote(dropped ? 'Saved. The day itself was cleared because it did not sit alongside the new last day.' : 'Saved. The phases and the projection line have been rebuilt.');
      setTimeout(() => setNote(''), 4000);
    } catch (e) { setNote((e as Error).message); }
  };

  // Dates that matter
  const [mDate, setMDate] = useState(''), [mKind, setMKind] = useState<'task' | 'lab'>('task'), [mText, setMText] = useState('');
  const addMs = async () => {
    if (!isKey(mDate.trim()) || !mText.trim()) return;
    try { await db.addMilestone({ goal_id: G.id, date: mDate.trim(), kind: mKind, text: mText.trim().slice(0, 120) }); setMDate(''); setMText(''); await reload(); touch(); }
    catch (e) { toast((e as Error).message); }
  };

  const next = async () => {
    const last = now;
    const startKg = last != null ? last : G.targetKg || G.startKg;
    const st = todayKey();
    const target = startKg == null ? null : G.type === 'muscle' ? Math.round((startKg + 3) * 10) / 10 : G.type === 'recomp' || G.type === 'health' ? startKg : Math.max(0, Math.round((startKg - 8) * 10) / 10);
    try { await db.finishGoal({ end_kg: last, start: st, due: key(addDays(d(st), 83)), start_kg: startKg, target_kg: target }); await reload(); touch(); toast('New goal started'); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle} accessibilityRole="header">{G.name || 'Your goal'}</Text>
      {!!G.why && <Text style={[s.body2, { fontSize: 16 }]}>{G.why}</Text>}
      <Stats items={[
        { k: 'Days left', v: String(left), n: 'until ' + shortDate(d(T.DEPART)) },
        { k: 'Day', v: String(elapsed), n: `of ${T.TOTAL}, week ${Math.max(1, Math.min(T.WEEKS_N, Math.ceil(elapsed / 7)))} of ${T.WEEKS_N}` },
        { k: 'Target', v: trimNum(T.TARGET_KG) + ' kg', n: 'from ' + trimNum(T.START_KG) + ' kg' },
        { k: 'Moved', v: movedTxt, n: now != null ? 'now ' + trimNum(now) + ' kg' : 'log a weight' },
      ]} />
      <Meter k="Time" v={`${elapsed} of ${T.TOTAL} days`} pct={tp} color={c.gold} />
      <Meter k="Weight" v={toGo > 0 ? `${trimNum(Math.max(0, lost))} of ${trimNum(toGo)} kg` : 'no weight target set'} pct={wp} />
      {toGo > 0 && tp > 0 && <Cue>{wp >= tp - 4 ? 'Weight is keeping up with the calendar.' : `The calendar is ${Math.round(tp - wp)} points ahead of the weight. That is worth a look at the seven-day average rather than a panic.`}</Cue>}

      <Fold title="Edit this goal">
        {field('name', 'What you are aiming at', { placeholder: 'e.g. Summer, Wedding, Me', max: 40 })}
        {field('why', 'Why it matters', { placeholder: 'One line you will still believe in November', multiline: true, max: 160 })}
        <View style={s.row}>{field('start', 'Start', { placeholder: 'YYYY-MM-DD' })}{field('due', 'Last day of the plan', { placeholder: 'YYYY-MM-DD' })}</View>
        <View style={s.row}>{field('event', 'The day itself, if there is one', { placeholder: 'YYYY-MM-DD' })}{field('steps', 'Starting step target', { numeric: true, placeholder: '8000' })}</View>
        <View style={s.row}>{field('startKg', 'Start weight (kg)', { numeric: true })}{field('targetKg', 'Target weight (kg)', { numeric: true })}</View>
        <View style={s.row}>{field('kcal', 'Daily calories', { numeric: true, placeholder: '2200' })}{field('protein', 'Daily protein (g)', { numeric: true, placeholder: '180' })}</View>
        <Pressable onPress={() => setHome((h) => !h)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }} accessibilityRole="switch" accessibilityState={{ checked: home }}>
          <Switch value={home} onValueChange={setHome} trackColor={{ true: c.cat.move.fill }} />
          <View style={{ flex: 1 }}>
            <Text style={[s.body, { fontFamily: font.semibold }]}>Start at home</Text>
            <Text style={s.label}>First phase runs on dumbbells and bands. Leave this off if you already have a gym.</Text>
          </View>
        </Pressable>
        <Cue>The four phases and the projection line rebuild themselves around whatever dates you set. A shorter goal gets the same shape, compressed.</Cue>
        <Pressable style={s.primary} onPress={saveGoal}><Text style={s.primaryText}>Save goal</Text></Pressable>
        {!!note && <Cue>{note}</Cue>}
      </Fold>

      <Fold title="Dates that matter">
        {ms.length ? ms.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line, borderStyle: 'dotted' }}>
            <Text style={{ width: 52, fontFamily: font.regular, fontSize: 11.5, color: c.muted }}>{shortDate(d(m.date))}</Text>
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: m.kind === 'lab' ? c.dangerSoft : c.warnSoft }}>
              <Text style={{ fontFamily: font.bold, fontSize: 9.5, color: m.kind === 'lab' ? c.danger : c.warn }}>{m.kind === 'lab' ? 'bloods' : 'do'}</Text>
            </View>
            <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: c.ink2 }}>{m.text}</Text>
            <Pressable onPress={() => db.deleteMilestone(m.id).then(async () => { await reload(); touch(); })} accessibilityLabel="Remove" hitSlop={8}><Icon name="trash" size={16} color={c.muted} /></Pressable>
          </View>
        )) : <Cue>Nothing set. A date you have written down is the only kind that happens.</Cue>}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <TextInput style={[s.input, { width: 120 }]} value={mDate} onChangeText={setMDate} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} accessibilityLabel="Milestone date" />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['task', 'lab'] as const).map((k) => (
              <Pressable key={k} onPress={() => setMKind(k)} style={{ minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: mKind === k ? c.ink : c.line, backgroundColor: mKind === k ? c.ink : c.surface, justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 13, color: mKind === k ? c.paper : c.ink2 }}>{k === 'task' ? 'Milestone' : 'Bloods'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={[s.input, { flex: 1, minWidth: 160 }]} value={mText} onChangeText={setMText} maxLength={120} placeholder="What has to happen" placeholderTextColor={c.muted} accessibilityLabel="Milestone text" />
          <Mini label="Add" onPress={addMs} style={{ minHeight: 48 }} />
        </View>
        <Cue>These show up on the day itself in your checklist and on the timeline in Plan.</Cue>
      </Fold>

      <Fold title="Finish this goal, start the next">
        <Cue>Closing a goal keeps everything you logged. The new one starts from your latest weight, and the tracker rebuilds around it.</Cue>
        <Pressable style={s.primary} onPress={next}><Text style={s.primaryText}>Close and start a new goal</Text></Pressable>
      </Fold>

      {past.length > 0 && (
        <View style={{ gap: 2, marginTop: 8 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted, marginBottom: 4 }}>Finished</Text>
          {[...past].reverse().map((g) => (
            <View key={g.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <View><Text style={s.body}>{g.name || 'Goal'}</Text><Text style={s.label}>{shortDate(d(g.start_date))} – {shortDate(d(g.due_date))}</Text></View>
              <Text style={s.body}>{g.start_kg != null ? trimNum(+g.start_kg) : '—'} → {g.end_kg != null ? trimNum(+g.end_kg) + ' kg' : '—'}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
