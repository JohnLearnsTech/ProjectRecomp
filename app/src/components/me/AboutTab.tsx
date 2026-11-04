// Me > About you (r19 renderAbout + renderHistory) and Me > Notes (renderNotes).
import type React from 'react';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { d, diffDays, shortDate, trimNum } from '../../domain/dates';
import { kcalFloor, proteinFloor } from '../../domain/plan';
import * as db from '../../lib/db';
import { useRecomp } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';
import { Icon } from '../Icon';
import { Cue, Label, Mini, PanelHead } from '../ui';
import { toast as undoToast } from '../../lib/toast';

const SEXES: [db.Sex, string][] = [['unspecified', 'Prefer not to say'], ['female', 'Female'], ['male', 'Male']];

/** A native-feeling dropdown: tap to show the options under the field. */
function Select<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  const { c, s } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={s.row16}>{options.find((o) => o[0] === value)?.[1]}</Text>
        <Icon name="down" size={16} color={c.ink2} />
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.surface, overflow: 'hidden' }}>
          {options.map(([v, l]) => (
            <Pressable key={v} onPress={() => { onChange(v); setOpen(false); }} style={{ paddingHorizontal: 14, paddingVertical: 12, backgroundColor: v === value ? c.surface2 : c.surface }}>
              <Text style={[s.body, v === value && { fontFamily: font.semibold }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function AboutTab({ toast }: { toast: (t: string) => void }) {
  const { engine, profileRow, reload, touch } = useRecomp();
  const { c, s } = useTheme('move');
  const [f, setF] = useState<Record<string, string>>({});
  const [sex, setSex] = useState<db.Sex>('unspecified');
  const [joint, setJoint] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const p = profileRow; if (!p) return;
    const v = (x: unknown) => (x == null ? '' : String(x));
    setF({ name: v(p.name), age: v(p.age), height: v(p.height_cm), cuisine: v(p.cuisine), water: v(p.water_l), kfloor: v(p.kcal_floor), pfloor: v(p.protein_floor), rules: v(p.rules) });
    setSex(p.sex); setJoint(p.joint_friendly);
  }, [profileRow]);
  const num = (k: string, lo: number, hi: number) => { const x = +String(f[k] ?? '').replace(',', '.'); return f[k]?.trim() && x >= lo && x <= hi ? x : null; };
  const save = async () => {
    try {
      await db.updateProfile({
        name: (f.name ?? '').trim().slice(0, 30) || null, sex, age: num('age', 13, 100) == null ? null : Math.round(num('age', 13, 100)!), height_cm: num('height', 120, 230),
        cuisine: (f.cuisine ?? '').trim().slice(0, 40) || null, water_l: num('water', 1, 6),
        kcal_floor: num('kfloor', 900, 4000) == null ? null : Math.round(num('kfloor', 900, 4000)!), protein_floor: num('pfloor', 30, 300) == null ? null : Math.round(num('pfloor', 30, 300)!),
        joint_friendly: joint, rules: (f.rules ?? '').trim().slice(0, 1200) || null,
      });
      await reload(); touch(); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { toast((e as Error).message); }
  };
  const field = (k: string, label: string, numeric = false, extra: { placeholder?: string; max?: number } = {}) => (
    <View style={{ flex: 1, gap: 5 }}>
      <Label>{label}</Label>
      <TextInput style={s.input} value={f[k] ?? ''} onChangeText={(v) => setF((o) => ({ ...o, [k]: v }))} keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholder={extra.placeholder} placeholderTextColor={c.muted} maxLength={extra.max} accessibilityLabel={label} />
    </View>
  );
  return (
    <View style={{ gap: 14 }}>
      <View style={s.card}>
        <PanelHead title="About you" />
        <Cue>Recomp uses these for your targets, your food estimates and every plan Claude builds.</Cue>
        <View style={s.row}>
          {field('name', 'Name', false, { max: 30 })}
          <View style={{ flex: 1, gap: 5 }}><Label>Sex</Label><Select label="Sex" value={sex} options={SEXES} onChange={setSex} /></View>
        </View>
        <View style={s.row}>{field('age', 'Age', true)}{field('height', 'Height (cm)', true)}</View>
        <View style={s.row}>{field('cuisine', 'What you usually eat', false, { placeholder: 'e.g. Indian, Mediterranean', max: 40 })}{field('water', 'Water a day (L)', true, { placeholder: '3' })}</View>
        <View style={s.row}>
          {field('kfloor', 'Lowest calories ever (kcal)', true, { placeholder: String(kcalFloor(engine.PROFILE)) })}
          {field('pfloor', 'Lowest protein ever (g)', true, { placeholder: String(proteinFloor(engine.PROFILE, engine.G)) })}
        </View>
        <Pressable onPress={() => setJoint((j) => !j)} accessibilityRole="checkbox" accessibilityState={{ checked: joint }}
          style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.lineSoft, backgroundColor: c.surface2 }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: joint ? c.cat.move.fill : c.muted, backgroundColor: joint ? c.cat.move.fill : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
            {joint && <Icon name="check" size={14} color={c.cat.move.on} stroke={3} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.body, { fontFamily: font.semibold }]}>Go easy on my joints</Text>
            <Text style={s.label}>No running or jumping, nothing that needs getting down onto the floor.</Text>
          </View>
        </Pressable>
        <View style={{ gap: 5 }}>
          <Label>Anything Claude must always respect</Label>
          <TextInput style={[s.input, { minHeight: 96, textAlignVertical: 'top', paddingTop: 10 }]} multiline maxLength={1200} value={f.rules ?? ''} onChangeText={(v) => setF((o) => ({ ...o, rules: v }))}
            placeholder="One per line. e.g. Old shoulder injury: no overhead pressing." placeholderTextColor={c.muted} accessibilityLabel="Anything Claude must always respect" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable style={[s.primary, { paddingHorizontal: 28 }]} onPress={save}><Text style={s.primaryText}>Save</Text></Pressable>
          {saved && <Cue>Saved</Cue>}
        </View>
      </View>
      <History toast={toast} />
    </View>
  );
}

/** "Before you started": weigh-ins from before tracking began (r19 renderHistory). */
function History({ toast }: { toast: (t: string) => void }) {
  const { profileRow } = useRecomp();
  const { c, s } = useTheme();
  const [rows, setRows] = useState<db.WeighIn[]>([]);
  const [dk, setDk] = useState(''), [kg, setKg] = useState(''), [nt, setNt] = useState('');
  const load = () => db.listWeightHistory().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);
  const hcm = +(profileRow?.height_cm ?? 0);
  const tip = rows.length ? `From ${shortDate(d(rows[0].date))} to ${shortDate(d(rows[rows.length - 1].date))}: ${trimNum(+rows[0].kg)} to ${trimNum(+rows[rows.length - 1].kg)} kg over ${diffDays(d(rows[0].date), d(rows[rows.length - 1].date))} days. They show as a faded line on the weight chart's Goal range.`
    : 'Weigh-ins from before you started tracking.';
  const add = async () => {
    const w = +kg.replace(',', '.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk.trim())) return toast('Date as YYYY-MM-DD');
    if (!(w > 20 && w < 400)) return toast('Weight in kg, between 20 and 400');
    try { await db.upsertWeighIn({ date: dk.trim(), kg: w, note: nt.trim().slice(0, 40) || null }); setDk(''); setKg(''); setNt(''); load(); } catch (e) { toast((e as Error).message); }
  };
  return (
    <View style={s.card}>
      <PanelHead title="Before you started" info={{ text: tip, label: 'About earlier weigh-ins' }} />
      {rows.length ? (
        <View style={{ borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((x, i) => {
            const dl = i ? +rows[i - 1].kg - +x.kg : 0;
            return (
              <View key={x.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: c.lineSoft }}>
                <Text style={{ width: 52, fontFamily: font.regular, fontSize: 13, color: c.ink2 }}>{shortDate(d(x.date))}</Text>
                <View style={{ width: 62 }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 15, color: c.ink }}>{trimNum(+x.kg)}</Text>
                  {!!hcm && <Text style={{ fontFamily: font.regular, fontSize: 10.5, color: c.muted }}>BMI {trimNum(+x.kg / Math.pow(hcm / 100, 2))}</Text>}
                </View>
                <Text style={{ width: 40, fontFamily: font.regular, fontSize: 13, color: dl > 0 ? c.cat.move.ink : c.warn }}>{i ? (dl > 0 ? '−' : '+') + trimNum(Math.abs(dl)) : ''}</Text>
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.regular, fontSize: 13, color: c.ink2 }}>{x.note || ''}</Text>
                <Pressable onPress={() => db.deleteWeighIn(x.date).then(() => { load(); undoToast(`Removed ${shortDate(d(x.date))}`, () => db.upsertWeighIn(x).then(load)); })} accessibilityLabel={`Remove ${shortDate(d(x.date))}`} hitSlop={8}><Icon name="trash" size={16} color={c.muted} /></Pressable>
              </View>
            );
          })}
        </View>
      ) : <Cue>Weigh-ins from before you started tracking. Add them and they show as a faded line on the weight chart.</Cue>}
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} value={dk} onChangeText={setDk} placeholder="YYYY-MM-DD" placeholderTextColor={c.muted} accessibilityLabel="Date" />
        <TextInput style={[s.input, { flex: 1 }]} value={kg} onChangeText={setKg} keyboardType="decimal-pad" placeholder="kg" placeholderTextColor={c.muted} accessibilityLabel="Weight in kg" />
      </View>
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} value={nt} onChangeText={setNt} maxLength={40} placeholder="Note" placeholderTextColor={c.muted} accessibilityLabel="Note" />
        <Mini label="Add" onPress={add} style={{ flex: 1, minHeight: 48 }} />
      </View>
    </View>
  );
}

/** r19 noteHTML: "- " lines become bullets, a blank line starts a new paragraph. */
function NoteBody({ body }: { body: string }) {
  const { s } = useTheme();
  const out: React.ReactElement[] = [];
  String(body || '').split(/\n\s*\n/).forEach((par, pi) => par.split('\n').forEach((l, li) => {
    if (/^\s*-\s+/.test(l)) out.push(<Text key={pi + '-' + li} style={[s.body, { paddingLeft: 14 }]}>•  {l.replace(/^\s*-\s+/, '')}</Text>);
    else if (l.trim()) out.push(<Text key={pi + '-' + li} style={[s.body, { lineHeight: 22 }]}>{l}</Text>);
  }));
  return <View style={{ gap: 6 }}>{out}</View>;
}

export function NotesTab({ toast }: { toast: (t: string) => void }) {
  const { c, s } = useTheme('move');
  const [notes, setNotes] = useState<db.Note[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ id: string; title: string; body: string; isNew: boolean } | null>(null);
  const load = () => db.listNotes().then(setNotes).catch(() => {});
  useEffect(() => { load(); }, []);
  const groups: string[] = []; const by: Record<string, db.Note[]> = {};
  notes.forEach((n) => { const g = n.group_name || 'My notes'; if (!by[g]) { by[g] = []; groups.push(g); } by[g].push(n); });
  const save = async () => {
    if (!edit) return;
    const n = notes.find((x) => x.id === edit.id);
    try {
      await db.upsertNote({ id: edit.id, group_name: n?.group_name || 'My notes', title: edit.title.trim().slice(0, 80) || 'Note', body: edit.body.slice(0, 8000), sort: n?.sort ?? notes.length });
      setEdit(null); await load(); toast('Note saved');
    } catch (e) { toast((e as Error).message); }
  };
  const editor = edit && (
    <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.lineSoft, backgroundColor: c.surface2 }}>
      <Label>Title</Label>
      <TextInput style={s.input} value={edit.title} maxLength={80} onChangeText={(t) => setEdit({ ...edit, title: t })} accessibilityLabel="Title" />
      <Label>Note</Label>
      <TextInput style={[s.input, { minHeight: 160, textAlignVertical: 'top', paddingTop: 10 }]} multiline value={edit.body} onChangeText={(t) => setEdit({ ...edit, body: t })} accessibilityLabel="Note" />
      <Cue>A line starting with a dash becomes a bullet. A blank line starts a new paragraph.</Cue>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={[s.primary, { paddingHorizontal: 24, minHeight: 44 }]} onPress={save}><Text style={s.primaryText}>Save</Text></Pressable>
        <Mini label="Cancel" onPress={() => setEdit(null)} />
        {!edit.isNew && <Mini label="Delete" style={{ marginLeft: 'auto' }} onPress={async () => {
          const gone = notes.find((x) => x.id === edit.id); setEdit(null); await db.deleteNote(edit.id); await load();
          if (gone) undoToast(`Deleted “${gone.title}”`, () => db.upsertNote(gone).then(load));
        }} />}
      </View>
    </View>
  );
  return (
    <View style={s.card}>
      <PanelHead title="Your notes" />
      {!notes.length && !edit && <Cue>Keep anything you want to remember here: advice from your doctor, what works for you, the reasoning behind your numbers.</Cue>}
      {groups.map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>{g}</Text>
          {by[g].map((n) => edit?.id === n.id ? <View key={n.id}>{editor}</View> : (
            <View key={n.id} style={{ borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, backgroundColor: c.surface }}>
              <Pressable onPress={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))} accessibilityState={{ expanded: !!open[n.id] }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 16, color: c.ink, flex: 1 }}>{n.title}</Text>
                <Icon name={open[n.id] ? 'up' : 'down'} size={15} color={c.ink2} stroke={2.6} />
              </Pressable>
              {open[n.id] && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                  <NoteBody body={n.body} />
                  <View style={{ flexDirection: 'row' }}><Mini label="Edit" onPress={() => setEdit({ id: n.id, title: n.title, body: n.body, isNew: false })} /></View>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
      {edit?.isNew && editor}
      {!edit && <View style={{ flexDirection: 'row' }}><Mini label="+ Add a note" onPress={() => setEdit({ id: 'n' + Date.now().toString(36), title: 'New note', body: '', isNew: true })} /></View>}
    </View>
  );
}
