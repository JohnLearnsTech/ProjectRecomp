import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { aiMessage, type Per100 } from '../domain/ai';
import { trimNum } from '../domain/dates';
import { addMealRows } from '../lib/foodlog';
import { logLabelFood, pickPhoto, scanLabel, scanPlate } from '../lib/ai';
import { font, useTheme } from '../lib/theme';
import { Icon } from './Icon';

type Done = (msg: string) => void;

/** Label and plate buttons under the food box (r19 scanRow / plateRow). */
export function PhotoButtons({ day, disabled, keyed, cuisine, onDone, onBusy }: { day: string; disabled: boolean; keyed: boolean; cuisine?: string | null; onDone: Done; onBusy: (b: string | null) => void }) {
  const { c } = useTheme('food');
  const [label, setLabel] = useState<{ name: string; grams: number; per: Per100; manual?: boolean } | null>(null);
  const [plate, setPlate] = useState<NonNullable<Awaited<ReturnType<typeof scanPlate>>> | null>(null);
  const choose = (then: (camera: boolean) => void) =>
    Alert.alert('Photo', undefined, [{ text: 'Take a photo', onPress: () => then(true) }, { text: 'Choose from gallery', onPress: () => then(false) }, { text: 'Cancel', style: 'cancel' }]);
  const run = async (camera: boolean, kind: 'label' | 'plate') => {
    try {
      const photo = await pickPhoto(camera); if (!photo) return;
      onBusy(kind === 'label' ? 'Reading the label…' : 'Looking at your plate…');
      if (kind === 'label') {
        const r = await scanLabel(photo);
        if (!r) onDone('Could not read a nutrition label in that photo. Try a straighter, closer shot of the panel, or type the item instead.'); else setLabel(r);
      } else {
        const r = await scanPlate(photo, cuisine);
        if (!r) onDone('Could not make out any food in that photo. Try again from above, with the whole plate in view.');
        else if (!r.items.length) onDone('No portion sizes came back. Type the meal instead.'); else setPlate(r);
      }
    } catch (e) { onDone(e instanceof Error && !('code' in e) ? e.message : aiMessage(e)); } finally { onBusy(null); }
  };
  return (
    <>
      {/* r19 #scanRow / #plateRow: round icon buttons beside Add, shown when Claude can read photos. */}
      {keyed && (
        <>
          <Pressable onPress={() => choose((cam) => run(cam, 'label'))} disabled={disabled} accessibilityLabel="Scan a nutrition label"
            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
            <Icon name="camera" size={18} color={c.ink} />
          </Pressable>
          <Pressable onPress={() => choose((cam) => run(cam, 'plate'))} disabled={disabled} accessibilityLabel="Photo of your plate"
            style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
            <Icon name="plate" size={18} color={c.ink} />
          </Pressable>
        </>
      )}
      {label && <LabelSheet init={label} onClose={() => setLabel(null)} onAdd={async (n, per, g) => { setLabel(null); try { await logLabelFood(day, n, per, g); onDone('Added from the label.'); } catch (e) { onDone((e as Error).message); } }} />}
      {plate && <PlateSheet r={plate} onClose={() => setPlate(null)} onAdd={async (rows) => { setPlate(null); try { await addMealRows(day, rows); onDone('Added the meal from your photo.'); } catch (e) { onDone((e as Error).message); } }} />}
    </>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { c, s } = useTheme('food');
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <ScrollView style={{ maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={s.cardTitle}>{title}</Text>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const n0 = (v: string) => { const x = Number(v.replace(',', '.')); return Number.isFinite(x) && x >= 0 ? x : 0; };

/** r19 showLabelConfirm / showManualLabel: per 100 g from the pack, then grams eaten. */
function LabelSheet({ init, onClose, onAdd }: { init: { name: string; grams: number; per: Per100; manual?: boolean }; onClose: () => void; onAdd: (n: string, per: Per100, g: number) => void }) {
  const { c, s } = useTheme('food');
  const [name, setName] = useState(init.name);
  const [g, setG] = useState(String(init.grams));
  const [per, setPer] = useState<Record<keyof Per100, string>>({ kcal: init.manual ? '' : trimNum(init.per.kcal), p: init.manual ? '' : trimNum(init.per.p), c: init.manual ? '' : trimNum(init.per.c), f: init.manual ? '' : trimNum(init.per.f), fib: init.manual ? '' : trimNum(init.per.fib) });
  const P: Per100 = { kcal: n0(per.kcal), p: n0(per.p), c: n0(per.c), f: n0(per.f), fib: n0(per.fib) };
  const grams = n0(g), m = grams / 100;
  return (
    <Sheet title={init.manual ? 'Enter the label' : 'From the label'} onClose={onClose}>
      <Text style={s.body2}>{init.manual ? 'Type the numbers printed on the pack (per 100 g), then how much you ate. No photo needed.' : `Per 100 g: ${Math.round(P.kcal)} kcal, ${trimNum(P.p)} g P, ${trimNum(P.c)} g C, ${trimNum(P.f)} g F, ${trimNum(P.fib)} g fib. Check the numbers, then the grams.`}</Text>
      <Text style={s.label}>Item name</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} maxLength={80} placeholder="Digestive biscuits" placeholderTextColor={c.muted} />
      <Text style={s.label}>Per 100 g</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['kcal', 'kcal'], ['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g'], ['fib', 'Fiber g']] as const).map(([k, l]) => (
          <View key={k} style={{ width: '30%', flexGrow: 1, gap: 4 }}>
            <Text style={s.label}>{l}</Text>
            <TextInput style={s.input} value={per[k]} onChangeText={(v) => setPer((o) => ({ ...o, [k]: v }))} keyboardType="decimal-pad" accessibilityLabel={l} />
          </View>
        ))}
      </View>
      <Text style={s.label}>How much did you eat? (grams)</Text>
      <TextInput style={[s.input, { width: 140 }]} value={g} onChangeText={setG} keyboardType="decimal-pad" accessibilityLabel="Grams eaten" />
      <Text style={s.body2}>Logs as {Math.round(P.kcal * m)} kcal, {trimNum(P.p * m)} g protein, {trimNum(P.f * m)} g fat for {trimNum(grams)} g.</Text>
      <Pressable style={[s.primary, (!grams || !P.kcal || !name.trim()) && { opacity: 0.5 }]} disabled={!grams || !P.kcal || !name.trim()} onPress={() => onAdd(name.trim(), P, grams)}>
        <Text style={s.primaryText}>Add to log</Text>
      </Pressable>
    </Sheet>
  );
}

/** r19 showPlateConfirm: untick or correct items before logging them as one meal. */
function PlateSheet({ r, onClose, onAdd }: { r: { items: { n: string; g: number; per: Per100 }[]; confidence: string | null }; onClose: () => void; onAdd: (rows: { label: string; raw: string; kcal: number; p: number; c: number; f: number; fib: number; src: 'claude'; grams: number }[]) => void }) {
  const { c, s } = useTheme('food');
  const [items, setItems] = useState(r.items.map((it) => ({ ...it, on: true, gt: String(it.g) })));
  const tot = items.reduce((t, it) => { const g = n0(it.gt); return it.on ? { k: t.k + (it.per.kcal * g) / 100, p: t.p + (it.per.p * g) / 100 } : t; }, { k: 0, p: 0 });
  return (
    <Sheet title="From the photo" onClose={onClose}>
      <Text style={s.label}>{r.confidence ? `${r.confidence} confidence · ` : ''}Grams from a photo are rough. Correct them before adding; the numbers follow.</Text>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 }}>
          <Pressable onPress={() => setItems((o) => o.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: it.on }}
            style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: c.cat.food.ink, backgroundColor: it.on ? c.cat.food.fill : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {it.on && <Text style={{ color: c.cat.food.on, fontFamily: font.bold }}>✓</Text>}
          </Pressable>
          <Text style={[s.body, { flex: 1, opacity: it.on ? 1 : 0.5 }]}>{it.n}</Text>
          <TextInput style={[s.input, { width: 72, textAlign: 'right' }]} value={it.gt} keyboardType="number-pad" accessibilityLabel={`${it.n} grams`}
            onChangeText={(v) => setItems((o) => o.map((x, j) => (j === i ? { ...x, gt: v } : x)))} />
          <Text style={s.label}>g</Text>
          <Text style={[s.label, { width: 64, textAlign: 'right' }]}>{Math.round((it.per.kcal * n0(it.gt)) / 100)} kcal</Text>
        </View>
      ))}
      <Text style={s.body}>Total <Text style={{ fontFamily: font.bold }}>{Math.round(tot.k).toLocaleString('en-IN')} kcal</Text> · <Text style={{ fontFamily: font.bold }}>{Math.round(tot.p)} g</Text> protein</Text>
      <Pressable style={s.primary} onPress={() => {
        const rows = items.filter((it) => it.on && n0(it.gt) > 0).map((it) => {
          const g = n0(it.gt), m = g / 100;
          return { label: `${it.n} (${trimNum(g)} g, from photo)`, raw: `${it.n} ${trimNum(g)} g`, kcal: it.per.kcal * m, p: it.per.p * m, c: it.per.c * m, f: it.per.f * m, fib: it.per.fib * m, src: 'claude' as const, grams: g };
        });
        if (rows.length) onAdd(rows);
      }}>
        <Text style={s.primaryText}>Add to log</Text>
      </Pressable>
    </Sheet>
  );
}
