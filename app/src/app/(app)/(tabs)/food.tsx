import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bar } from '../../../components/Bar';
import { FoodChart } from '../../../components/FoodChart';
import { PanelHead } from '../../../components/ui';
import { toast } from '../../../lib/toast';
import { Guides } from '../../../components/Guides';
import { Icon } from '../../../components/Icon';
import { PhotoButtons } from '../../../components/FoodAi';
import { aiMessage } from '../../../domain/ai';
import { estimateRows, hasKey, reEstimate } from '../../../lib/ai';
import { handOffToClaude } from '../../../lib/connector';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { addKey, d, shortDate } from '../../../domain/dates';
import { foodName, foodTotals, fqQty, mealKcal, mealSig, recentMeals, shortFoodLabel } from '../../../domain/food';
import type { FoodRow } from '../../../domain/types';
import { useDays } from '../../../lib/days';
import * as db from '../../../lib/db';
import { addFoodText, addMealRows, rememberFood, toRow } from '../../../lib/foodlog';
import { useRecomp } from '../../../lib/recomp';
import { font, useTheme } from '../../../lib/theme';

type Row = ReturnType<typeof toRow>;
const n0 = (x: number) => Math.round(x).toLocaleString('en-IN');
const n1 = (x: number) => (Math.round(x * 10) / 10).toString();
const SRC: Record<string, string> = { table: 'table', claude: 'estimate', you: 'yours', label: 'label', none: 'no numbers', pending: 'no numbers' };

export default function Food() {
  const { engine, day, maxDay, rev, touch, foodIndex, profileRow } = useRecomp();
  const { c, s } = useTheme('food');
  const params = useLocalSearchParams<{ focus?: string }>();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<db.SavedMeal[]>([]);
  const [fqEdit, setFqEdit] = useState(false);
  const [recent, setRecent] = useState<ReturnType<typeof recentMeals<Row>>>([]);
  const [edit, setEdit] = useState<Row | null>(null);
  const [saveFor, setSaveFor] = useState<Row[] | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  useEffect(() => { hasKey().then(setKeyed).catch(() => setKeyed(false)); }, [rev]);

  const P = engine.plan(day), targets = engine.PL.targets, future = day > maxDay;
  const { START } = engine.T;

  const load = useCallback(async () => {
    const from = addKey(maxDay, -20) < START ? START : addKey(maxDay, -20);
    const [today, meals, range] = await Promise.all([db.listFood(day), db.listSavedMeals(), db.listFoodRange(from, maxDay)]);
    setRows(today.map(toRow));
    setSaved(meals);
    const byDay: Record<string, Row[]> = {};
    range.forEach((e) => (byDay[e.date] ||= []).push(toRow(e)));
    setRecent(recentMeals(Object.keys(byDay).sort().reverse().map((k) => [k, byDay[k]] as [string, Row[]])));
  }, [day, maxDay, START]);
  useEffect(() => { load().catch((e) => setStatus(e.message)); }, [load, rev]);
  useEffect(() => { if (params.focus) setTimeout(() => inputRef.current?.focus(), 250); }, [params.focus]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    // Reload before releasing the button so the new rows are on screen when "Adding…" ends.
    try { await fn(); await load(); touch(); } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  };

  const add = () => run(async () => {
    const r = await addFoodText(day, text, foodIndex);
    setText('');
    const bits = [];
    if (r.table) bits.push(`${r.table} from the built-in table`);
    if (r.cached) bits.push(`${r.cached} from your earlier estimates`);
    if (r.pending && !keyed) bits.push(`${r.pending} with no numbers yet. Tap ${r.pending > 1 ? 'those rows' : 'that row'} to fill ${r.pending > 1 ? 'them' : 'it'} in`);
    setStatus(bits.length ? `Added ${bits.join(', ')}.` : null);
    // With a key, r19's flow: anything the table could not place goes straight to Claude.
    if (r.pending && keyed) await estimatePending(`Not in the table, so Claude is estimating ${r.pending} item${r.pending > 1 ? 's' : ''}…`);
  });

  /** r19 bulkAsk: every row of the day that still needs numbers, in one Claude call. */
  const estimatePending = async (msg?: string) => {
    const rowsNow = (await db.listFood(day)).filter((e) => e.needs_estimate);
    if (!rowsNow.length) return;
    setAiBusy(msg ?? `Estimating ${rowsNow.length} item${rowsNow.length > 1 ? 's' : ''} with Claude…`);
    try {
      const got = await estimateRows(rowsNow, profileRow?.cuisine);
      const left = rowsNow.length - got;
      setStatus(got ? `${got} item${got > 1 ? 's' : ''} estimated by Claude, not looked up in a table. Tap any row to correct it.${left ? ` ${left} could not be read back.` : ''}`
        : 'Nothing came back that could be read. Try describing those rows more plainly.');
    } catch (e) {
      setStatus(`${aiMessage(e)} Those rows are in the log with no numbers. Try again, or tap them to fill them in.`);
    } finally { setAiBusy(null); await load(); touch(); }
  };

  // One-tap cards: every saved meal, then up to 6 recent ones not already saved.
  const savedSigs = new Set(saved.map((m) => m.sig));
  const quick = [
    ...saved.map((m) => ({ key: 'm' + m.id, title: m.name, rows: m.rows.map((r) => ({ ...r })) as FoodRow[], saved: m, sub: '' })),
    ...recent.filter((r) => !savedSigs.has(r.sig)).slice(0, 6).map((r) => ({
      key: 'r' + r.sig, title: foodName(r.rows[0].label), rows: r.rows as FoodRow[], saved: null as db.SavedMeal | null,
      sub: `${r.n}×, last ${r.last === maxDay ? 'today' : shortDate(d(r.last))}`,
    })),
  ];

  const t = foodTotals(rows);
  // The chart and Today read the day cache; if it disagrees with the rows just fetched (food
  // changed elsewhere, such as Claude through the connector), refresh it so every number matches.
  const { entries: dayCache, reload: reloadDays } = useDays();
  const cached = Math.round(+(dayCache[day]?.kcal ?? 0));
  const fresh = Math.round(rows.reduce((a, r) => a + (+r.kcal || 0), 0));
  useEffect(() => { if (rows.length && cached !== fresh) reloadDays().catch(() => {}); }, [cached, fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = rows.filter((r) => r.needs_estimate).length;

  // Group consecutive rows by meal for the table (legacy rows without a meal stay ungrouped).
  const groups = useMemo(() => {
    const out: { meal: number | null; rows: Row[] }[] = [];
    rows.forEach((r) => {
      const last = out[out.length - 1];
      if (last && last.meal === (r.meal ?? null) && r.meal != null) last.rows.push(r);
      else out.push({ meal: r.meal ?? null, rows: [r] });
    });
    return out;
  }, [rows]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={false} onRefresh={() => load()} />}>
          <ScreenHeader title="Food" cat="food" />

          <View style={s.card}>
            <PanelHead title="Food log" info={{ label: 'About this section', text: 'Type what you ate in plain words with amounts, one meal per entry. Common Indian foods resolve instantly from a built-in table. Anything else is estimated by Claude and tagged estimate; press edit on any row to correct it.' }} />
            <TextInput
              ref={inputRef}
              style={[s.input, { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]}
              multiline
              placeholder="2 chapati, 1 katori dal, 1 apple. A dish stays one entry: chicken salad with lettuce, capsicum, 20 g caesar dressing"
              placeholderTextColor={c.muted}
              value={text}
              onChangeText={setText}
              editable={!future}
            />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Pressable style={[s.primary, { flex: 1, minHeight: 46 }, (busy || future || !text.trim()) && { opacity: 0.5 }]} disabled={busy || future || !text.trim()} onPress={add}>
                <Text style={s.primaryText}>{busy ? 'Adding…' : day === maxDay ? 'Add to today' : `Add to ${shortDate(d(day))}`}</Text>
              </Pressable>
              <PhotoButtons day={day} disabled={busy || future || !!aiBusy} keyed={keyed} cuisine={profileRow?.cuisine}
                onBusy={setAiBusy} onDone={(m) => { setStatus(m); load(); touch(); }} />
            </View>
            {future && <Text style={s.label}>This day hasn't happened yet.</Text>}
            {aiBusy ? <Text style={[s.body2, { color: c.cat.food.ink }]}>{aiBusy}</Text> : status ? <Text style={s.body2}>{status}</Text> : null}

            {quick.length > 0 && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>One tap to log</Text>
                  {saved.length > 0 && <Pressable onPress={() => setFqEdit((x) => !x)} hitSlop={8}><Text style={{ fontFamily: font.bold, fontSize: 12, color: c.cat.food.ink }}>{fqEdit ? 'Done' : 'Edit saved'}</Text></Pressable>}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {quick.map((q) => (
                    <Pressable key={q.key} disabled={busy || future}
                      onPress={() => run(async () => {
                        const before = new Set((await db.listFood(day)).map((x) => x.id));
                        await addMealRows(day, q.rows);
                        const added = (await db.listFood(day)).filter((x) => !before.has(x.id)).map((x) => x.id);
                        toast(`Logged ${q.title} · ${n0(mealKcal(q.rows))} kcal`, () => run(async () => { for (const id of added) await db.deleteFood(id); }));
                      })}
                      onLongPress={() => q.saved && Alert.alert('Remove saved meal?', q.saved.name, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => run(() => db.deleteSavedMeal(q.saved!.id)) },
                      ])}
                      style={{ width: 190, minHeight: 96, borderRadius: 14, borderWidth: q.saved ? 1.5 : 1, borderColor: q.saved ? c.cat.food.fill : c.lineSoft, backgroundColor: q.saved ? c.cat.food.soft : c.surface2, padding: 12, gap: 4 }}>
                      {q.saved && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.body, { fontFamily: font.bold, flex: 1 }]} numberOfLines={1}>★ {q.title}</Text>
                        {fqEdit && <Pressable onPress={() => { const sv = q.saved!; run(async () => { await db.deleteSavedMeal(sv.id); toast(`Removed “${sv.name}”`, () => run(() => db.saveMeal(sv.name, sv.sig, sv.rows))); }); }} accessibilityLabel={`Remove ${q.title}`} hitSlop={8}
                          style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.paper, fontSize: 13, lineHeight: 15 }}>×</Text></Pressable>}
                      </View>}
                      {q.rows.slice(0, 3).map((r, i) => (
                        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                          <Text style={[s.body, { flex: 1, fontFamily: q.saved ? font.regular : font.semibold }]} numberOfLines={1}>{foodName(r.label)}</Text>
                          <Text style={[s.label, { color: c.cat.food.ink }]}>{fqQty(r.label)}</Text>
                        </View>
                      ))}
                      {q.rows.length > 3 && <Text style={s.label}>+{q.rows.length - 3} more</Text>}
                      <Text style={s.label}>{n0(mealKcal(q.rows))} kcal{q.sub ? ` · ${q.sub}` : ''}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <Totals label="Calories" value={`${n0(t.kcal)} / ${n0(P.kcal)} · ${t.kcal <= P.kcal ? `${n0(P.kcal - t.kcal)} left` : `${n0(t.kcal - P.kcal)} over`}`}
              frac={t.kcal / (P.kcal || 1)} color={t.kcal > P.kcal + 100 ? c.warn : c.cat.food.fill} />
            <Totals label="Protein" value={`${n0(t.p)} / ${n0(P.protein)} g · ${t.p >= P.protein ? 'done' : `${n0(P.protein - t.p)} g to go`}`}
              frac={t.p / (P.protein || 1)} color={c.cat.protein.fill} />
            <Text style={s.label}>
              Carbs <Text style={{ color: c.ink, fontFamily: font.semibold }}>{n0(t.c)}</Text>/{targets.carb} g{'    '}
              Fat <Text style={{ color: c.ink, fontFamily: font.semibold }}>{n0(t.f)}</Text>/{targets.fat} g{'    '}
              Fiber <Text style={{ color: t.fib >= 30 ? c.cat.move.ink : c.ink, fontFamily: font.semibold }}>{n0(t.fib)}</Text>/{targets.fiber} g
            </Text>

            {pending > 0 && (
              <View style={{ backgroundColor: c.warnSoft, borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={[s.body, { color: c.ink }]}>
                  {pending} item{pending > 1 ? 's need' : ' needs'} numbers. {keyed ? 'Claude can estimate them, or tap a row to type them in.' : 'Tap a row to type them in, or let Claude fill them through the Project Recomp connector (Me, Settings).'}
                </Text>
                {!keyed && (
                  <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={() => handOffToClaude()}>
                    <Text style={s.outlineText}>Estimate with Claude</Text>
                  </Pressable>
                )}
                {keyed && (
                  <Pressable style={[s.outline, { alignSelf: 'flex-start' }, !!aiBusy && { opacity: 0.5 }]} disabled={!!aiBusy} onPress={() => estimatePending()}>
                    <Text style={s.outlineText}>{aiBusy ? 'Asking Claude…' : `Estimate ${pending > 1 ? `all ${pending}` : 'it'} with Claude`}</Text>
                  </Pressable>
                )}
              </View>
            )}

            {rows.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexDirection: 'column' }}>
                <View style={{ borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, overflow: 'hidden' }}>
                  <TRow head cells={['Meal', 'Food item', 'kcal', 'P', 'C', 'F', 'Fib']} />
                  {groups.map((g, gi) => {
                    const st = foodTotals(g.rows);
                    return (
                      <View key={gi}>
                        {g.rows.map((r, i) => (
                          <View key={r.id}>
                            <TRow editing={edit?.id === r.id} onEdit={() => setEdit(r)} onDelete={() => run(async () => { if (edit?.id === r.id) setEdit(null); await db.deleteFood(r.id); })}
                              meal={i === 0 && g.meal != null ? `Meal ${g.meal}` : ''}
                              item={shortFoodLabel(r.label)}
                              tag={SRC[r.src ?? 'none']}
                              warn={r.needs_estimate}
                              cells={[n0(r.kcal), n1(r.p), n1(r.c), n1(r.f), n1(r.fib)]}
                            />
                          </View>
                        ))}
                        {g.meal != null && (
                          <TRow subtotal item="Subtotal" fatFlag={st.f > 20}
                            cells={[n0(st.kcal), n1(st.p), n1(st.c), n1(st.f), n1(st.fib)]}
                            action={!g.rows.some((r) => r.needs_estimate) ? { label: 'Save meal', onPress: () => setSaveFor(g.rows) } : undefined} />
                        )}
                      </View>
                    );
                  })}
                  <TRow total item="Day total" cells={[n0(t.kcal), n1(t.p), n1(t.c), n1(t.f), n1(t.fib)]} />
                </View>
              </ScrollView>
            ) : (
              <Text style={s.body2}>Nothing logged for this day yet.</Text>
            )}
            {edit && <EditRow key={edit.id} row={edit} keyed={keyed} cuisine={profileRow?.cuisine} onClose={() => setEdit(null)} onDone={() => { setEdit(null); touch(); load(); }} />}
          </View>

          <FoodChart />
          <Guides kind="eat" />
        </ScrollView>
      </KeyboardAvoidingView>

      {saveFor && <SaveMeal rows={saveFor} onClose={() => setSaveFor(null)} onDone={() => { setSaveFor(null); touch(); setStatus('Meal saved. It now has a one-tap card.'); }} />}
    </SafeAreaView>
  );
}

function Totals({ label, value, frac, color }: { label: string; value: string; frac: number; color: string }) {
  const { s } = useTheme('food');
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.label}>{label}</Text>
        <Text style={[s.body, s.num]}>{value}</Text>
      </View>
      <Bar frac={frac} color={color} height={8} />
    </View>
  );
}

// Number columns fit a bold four-digit total ("1,779", "136.4") at large phone text sizes.
const COLS = [62, 250, 66, 58, 58, 58, 54, 76];
function TRow({ head, subtotal, total, meal, item, tag, warn, cells, fatFlag, action, onEdit, onDelete, editing }: {
  head?: boolean; subtotal?: boolean; total?: boolean; meal?: string; item?: string; tag?: string; warn?: boolean; fatFlag?: boolean;
  cells: string[]; action?: { label: string; onPress: () => void }; onEdit?: () => void; onDelete?: () => void; editing?: boolean;
}) {
  const { c, s } = useTheme('food');
  const all = head ? cells : [meal ?? '', item ?? '', ...cells];
  const bold = head || total || subtotal;
  return (
    <View style={{ flexDirection: 'row', minHeight: 40, alignItems: 'center', borderTopWidth: head ? 0 : 1, borderTopColor: c.lineSoft,
      backgroundColor: editing ? c.cat.food.soft : head || total ? c.surface2 : c.surface }}>
      {all.map((v, i) => (
        <View key={i} style={{ width: COLS[i], paddingHorizontal: 8, paddingVertical: 6, alignItems: i >= 2 ? 'flex-end' : 'flex-start', flexDirection: i === 1 ? 'row' : 'column', gap: 6, ...(i === 1 ? { alignItems: 'center' } : null) }}>
          {i === 1 && action ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.label}>{v}</Text>
              <Pressable onPress={action.onPress} hitSlop={8} style={{ backgroundColor: c.cat.food.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12, color: c.cat.food.ink }}>{action.label}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[i < 2 ? s.body : [s.body, s.num], bold && { fontFamily: font.semibold }, head && s.label, subtotal && i === 1 && s.label,
              i === 0 && !head && { fontSize: 12, color: c.ink2, fontFamily: Platform.OS === 'web' ? 'ui-monospace, monospace' : 'monospace' }, i === 1 && !head && { flexShrink: 1, fontSize: 13.5 }, i >= 2 && !head && { fontSize: 13.5 }, fatFlag && i === 5 && { color: c.warn }]}
              numberOfLines={1} adjustsFontSizeToFit={i >= 2} minimumFontScale={0.75} maxFontSizeMultiplier={i >= 2 ? 1.3 : undefined}>
              {v}
            </Text>
          )}
          {i === 1 && tag && (
            <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: warn ? c.warnSoft : c.cat.food.soft }}>
              <Text style={{ fontSize: 10, fontFamily: font.bold, color: warn ? c.warn : c.cat.food.ink }}>{tag}</Text>
            </View>
          )}
        </View>
      ))}
      <View style={{ width: COLS[7], flexDirection: 'row', gap: 6, justifyContent: 'flex-end', paddingRight: 8 }}>
        {onEdit && <Pressable onPress={onEdit} accessibilityLabel="Edit this row" hitSlop={4}
          style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Icon name="edit" size={14} color={c.ink2} /></Pressable>}
        {onDelete && <Pressable onPress={onDelete} accessibilityLabel="Remove this row" hitSlop={4}
          style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" size={15} color={c.muted} /></Pressable>}
      </View>
    </View>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { c, s } = useTheme('food');
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 }}>
          <Text style={s.cardTitle}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const FIELDS = [['kcal', 'kcal'], ['p', 'Protein g'], ['c', 'Carbs g'], ['f', 'Fat g'], ['fib', 'Fiber g']] as const;

/** Row edit: unchanged numbers keep the source; changed ones become "yours" and are remembered. */
/** r19 editPanel: inline under the table. "Ask Claude again" fills the boxes; nothing saves until Save row. */
function EditRow({ row, keyed, cuisine, onClose, onDone }: { row: Row; keyed: boolean; cuisine?: string | null; onClose: () => void; onDone: () => void }) {
  const { c, s } = useTheme('food');
  const [label, setLabel] = useState(row.label);
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k]) => [k, row.src === 'none' && !row[k] ? '' : String(row[k])])));
  const [note, setNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [snap, setSnap] = useState<Record<string, string> | null>(null);
  const save = async () => {
    const num: Record<string, number> = {};
    for (const [k, l] of FIELDS) {
      const x = v[k].trim() === '' ? 0 : Number(v[k].replace(',', '.'));
      if (!Number.isFinite(x) || x < 0 || x > (k === 'kcal' ? 5000 : 500)) return setNote(`${l} looks off.`);
      num[k] = x;
    }
    if (row.src === 'none' && !num.kcal && !num.p) return setNote('Enter at least calories or protein.');
    const changed = FIELDS.some(([k]) => num[k] !== +row[k]);
    // Still exactly what Claude filled in: an estimate, not yours (r19 edClaudeSnap).
    const fromClaude = !!snap && FIELDS.every(([k]) => v[k] === snap[k]);
    try {
      await db.updateFood(row.id, {
        label: label.trim() || row.label, kcal: num.kcal, protein_g: num.p, carbs_g: num.c, fat_g: num.f, fiber_g: num.fib,
        source: fromClaude ? 'claude' : changed || row.src === 'none' ? 'you' : (row.src as db.FoodSource),
      });
      if (changed && !fromClaude) await rememberFood(row.raw ?? row.label, label.trim() || row.label, { kcal: num.kcal, p: num.p, c: num.c, f: num.f, fib: num.fib }, null);
      onDone();
    } catch (e) { setNote((e as Error).message); }
  };
  const ask = async () => {
    setAsking(true); setNote('Asking Claude…');
    try {
      const e = await reEstimate(row.raw || label, cuisine);
      if (!e) { setNote('Nothing came back that could be read. Try describing it more plainly.'); return; }
      const nv = { kcal: String(Math.round(e.kcal)), p: String(e.p), c: String(e.c), f: String(e.f), fib: String(e.fib) };
      setV(nv); setSnap(nv); setLabel(e.label || label); setNote('Filled in. Press Save row to keep it.');
    } catch (e) { setNote(aiMessage(e)); } finally { setAsking(false); }
  };
  const box = (k: string, l: string) => (
    <View key={k} style={{ width: '18%', flexGrow: 1, gap: 4 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink2 }}>{l}</Text>
      <TextInput style={[s.input, { minHeight: 42, paddingHorizontal: 8 }]} keyboardType="decimal-pad" value={v[k]} onChangeText={(x) => setV((o) => ({ ...o, [k]: x }))} accessibilityLabel={l} />
    </View>
  );
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: c.cat.food.fill, backgroundColor: c.cat.food.soft }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>Editing this row</Text>
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink2 }}>What it was</Text>
        <TextInput style={s.input} value={label} onChangeText={setLabel} accessibilityLabel="What it was" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{box('kcal', 'kcal')}{box('p', 'protein')}{box('c', 'carbs')}{box('f', 'fat')}{box('fib', 'fiber')}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Pressable style={[s.primary, { minHeight: 42, paddingHorizontal: 18 }]} onPress={save}><Text style={s.primaryText}>Save row</Text></Pressable>
        {keyed && <Pressable onPress={ask} disabled={asking} style={[s.outline, { minHeight: 40, borderRadius: 999, opacity: asking ? 0.5 : 1 }]}><Text style={s.outlineText}>Ask Claude again</Text></Pressable>}
        <Pressable onPress={onClose} style={[s.outline, { minHeight: 40, borderRadius: 999 }]}><Text style={s.outlineText}>Cancel</Text></Pressable>
        {note && <Text style={[s.label, { flexBasis: '100%' }]}>{note}</Text>}
      </View>
      <Text style={s.label}>
        {keyed ? <><Text style={{ fontFamily: font.bold }}>Ask Claude again</Text> re-reads the description and fills the boxes; saved as it stands it is tagged estimate. </> : null}
        Change any number and it becomes yours. Either way nothing saves until you press Save row.
      </Text>
    </View>
  );
}

function SaveMeal({ rows, onClose, onDone }: { rows: Row[]; onClose: () => void; onDone: () => void }) {
  const { c, s } = useTheme('food');
  const [name, setName] = useState(foodName(rows[0]?.label ?? '').slice(0, 30));
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!name.trim()) return setErr('Give it a name.');
    try {
      await db.saveMeal(name.trim(), mealSig(rows), rows.map((r) => ({
        label: r.label, kcal: +r.kcal || 0, p: +r.p || 0, c: +r.c || 0, f: +r.f || 0, fib: +r.fib || 0,
        src: (r.src && r.src !== 'pending' ? r.src : 'you') as db.FoodSource, raw: r.raw || r.label,
      })));
      onDone();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Sheet title="Save meal" onClose={onClose}>
      <Text style={s.body2}>{mealSig(rows)}</Text>
      <TextInput style={s.input} value={name} onChangeText={(x) => setName(x.slice(0, 30))} placeholder="Name" placeholderTextColor={c.muted} />
      {err && <Text style={s.error}>{err}</Text>}
      <Pressable style={s.primary} onPress={save}><Text style={s.primaryText}>Save</Text></Pressable>
    </Sheet>
  );
}
