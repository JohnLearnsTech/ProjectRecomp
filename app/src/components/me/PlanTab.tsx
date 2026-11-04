// Me > Plan and Me > Targets (r19 renderPlanView, renderPhases and renderPlanAI).
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { aiMessage, cueFor, PLAN_CHIPS, planDiff, planWeekdays, type Proposal } from '../../domain/ai';
import { addDays, d, diffDays, key, shortDate } from '../../domain/dates';
import { defaultPlanFor, kcalFloor, normPlan } from '../../domain/plan';
import type { Plan } from '../../domain/types';
import { acceptProposal, proposePlan } from '../../lib/ai';
import * as db from '../../lib/db';
import { useDays } from '../../lib/days';
import { useRecomp } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';
import { Icon } from '../Icon';
import { Cue, Fold, Mini, PanelHead, Pill, Segmented } from '../ui';
import { toast as undoToast } from '../../lib/toast';

const exParts = (line: string) => { const q = String(line).split('|'); return { n: (q[0] || '').trim(), s: (q[1] || '').trim(), c: (q[2] || '').trim() }; };
const stable = (x: unknown) => JSON.stringify(x);
const clonePlan = (p: Plan): Plan => JSON.parse(JSON.stringify(p));
const PLAN_TIP = 'The training side of your plan: which session falls on which day in each phase, what is in each session, and the daily targets. Your medicines and daily checks are not part of it, and Claude never changes them.';

/** Which phase the Plan and Targets pages show; shared, as in r19 (planPhaseSel). */
let phaseSel: number | null = null;
const phaseSubs = new Set<(n: number) => void>();
function usePhaseSel(initial: number) {
  const [v, setV] = useState(phaseSel ?? initial);
  useEffect(() => { const f = (n: number) => setV(n); phaseSubs.add(f); return () => { phaseSubs.delete(f); }; }, []);
  // Until someone picks a phase, follow the current one (the goal can finish loading after the first draw).
  useEffect(() => { if (phaseSel == null) setV(initial); }, [initial]);
  return [v, (n: number) => { phaseSel = n; phaseSubs.forEach((f) => f(n)); }] as const;
}

function useSaved(engine: unknown) {
  const [hasSaved, setHasSaved] = useState<boolean | null>(null);
  useEffect(() => { db.getCurrentPlan().then((p) => setHasSaved(!!p)).catch(() => setHasSaved(false)); }, [engine]);
  return hasSaved;
}

export function PlanTab({ keyed, toast }: { keyed: boolean; toast: (t: string) => void }) {
  const { engine, maxDay, reload, touch } = useRecomp();
  const { c, s } = useTheme('move');
  const { PL, T, G, NAMES } = engine;
  const P = engine.plan(maxDay);
  const [sel, setSel] = usePhaseSel(P.inRange ? P.phase : 1);
  const [wk, setWk] = useState(0);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [rows, setRows] = useState<{ n: string; s: string }[]>([]);
  const hasSaved = useSaved(engine);
  const wn = planWeekdays(T.TSTART);
  const pi = sel - 1, ph = PL.phases[pi];
  const [w0, w1] = T.TPHASE_W[pi] ?? [1, 1];
  const a = addDays(d(T.TSTART), (w0 - 1) * 7), b = addDays(d(T.TSTART), Math.min(T.TTOTAL - 1, w1 * 7 - 1));
  const two = ph.weeks.length > 1 && stable(ph.weeks[0]) !== stable(ph.weeks[1]);
  const week = ph.weeks[two ? wk : 0] || ph.weeks[0];
  const used: Record<string, 1> = {};
  ph.weeks.forEach((w) => w.forEach((sl) => { if (sl.t === 'lift') used[sl.s] = 1; }));
  const keys = Object.keys(PL.programs).sort((x, y) => (used[y] ? 1 : 0) - (used[x] ? 1 : 0));
  const src = PL.by === 'default' ? 'The original protocol. Nothing has been changed yet.'
    : (PL.by === 'claude' ? 'Built with Claude' : 'Edited by you') + (PL.at ? ' on ' + shortDate(d(key(new Date(+PL.at)))) : '') + (PL.note ? ' · “' + PL.note + '”' : '');
  const dflt = defaultPlanFor(G, engine.PROFILE, T.TMAINT_W);
  const after = async (msg: string) => { await reload(); touch(); toast(msg); };

  const saveSession = async () => {
    if (!editKey) return;
    const ex = rows.filter((r) => r.n.trim()).map((r, i) => {
      const old = PL.programs[editKey].ex[i]; const prevE = old ? exParts(old) : null;
      const nm = r.n.trim(); return nm + '|' + r.s.trim() + '|' + (prevE && prevE.n === nm ? prevE.c : cueFor(nm, PL, dflt));
    });
    if (ex.some((l) => !/\d/.test(exParts(l).s))) return toast('Each exercise needs sets and reps, like 3 × 10');
    if (!ex.length) return toast('A session needs at least one exercise');
    const base = clonePlan(PL); base.programs[editKey].ex = ex;
    const np = normPlan({ ...base, by: 'you', at: Date.now(), note: 'Edited ' + PL.programs[editKey].name });
    setEditKey(null);
    if (!np) return toast('That did not save. Check the sets and reps.');
    try { await db.savePlanVersion({ body: np, source: 'you', note: np.note, kcal: G.kcal, protein: G.protein }); await after('Session saved'); }
    catch (e) { toast((e as Error).message); }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.card, { gap: 12 }]}>
        <PanelHead title="Your plan" info={{ text: PLAN_TIP, label: 'About the plan' }} />
        <Text style={[s.label, { marginTop: -6 }]}>{src}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {PL.phases.map((x, i) => (
            <Pill key={i} label={String(x.name).split('·').pop()!.trim() || 'Phase ' + (i + 1)} on={i === pi} dot={P.inRange && P.phase === i + 1}
              onPress={() => { setSel(i + 1); setWk(0); setEditKey(null); }} />
          ))}
        </View>
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: c.ink2 }}>
          <Text style={{ fontFamily: font.bold, color: c.ink }}>{ph.name}</Text> · {shortDate(a)} – {shortDate(b)} · weeks {w0}–{w1}
        </Text>
        {two && <Segmented items={[[0, 'Odd weeks'], [1, 'Even weeks']]} value={wk} onChange={setWk} />}
        <View style={{ borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, overflow: 'hidden' }}>
          {week.map((sl, i) => {
            const tl = sl.t === 'lift' ? 'Lift' : sl.t === 'rest' ? 'Rest' : 'Cardio';
            const tone = sl.t === 'lift' ? { bg: c.cat.move.soft, fg: c.cat.move.ink } : sl.t === 'rest' ? { bg: c.surface2, fg: c.muted } : { bg: c.warnSoft, fg: c.warn };
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.lineSoft, backgroundColor: c.surface }}>
                <Text style={{ width: 34, fontFamily: font.bold, fontSize: 12, color: c.muted, paddingTop: 2 }}>{wn[i]}</Text>
                <View style={{ width: 58 }}>
                  <View style={{ alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg, borderWidth: sl.t === 'rest' ? 1 : 0, borderColor: c.lineSoft }}>
                    <Text style={{ fontFamily: font.bold, fontSize: 9.5, color: tone.fg }}>{tl}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {sl.t === 'lift' ? (
                    <>
                      <Text style={{ fontFamily: font.bold, fontSize: 13.5, color: c.ink }}>{NAMES[sl.s] || sl.s}</Text>
                      {!!sl.c && <Text style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 17, color: c.muted }}>{sl.c}</Text>}
                    </>
                  ) : <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: c.ink }}>{sl.c || tl}</Text>}
                </View>
              </View>
            );
          })}
        </View>
        {!!ph.detail && <Cue>{ph.detail}</Cue>}

        <Text style={{ fontFamily: font.bold, fontSize: 15, color: c.ink, marginTop: 6 }}>Sessions</Text>
        {keys.map((k) => {
          const pg = PL.programs[k], editing = editKey === k;
          return (
            <SessionRow key={k} title={pg.name} meta={(pg.kit === 'home' ? 'Home' : pg.kit === 'body' ? 'No equipment' : 'Gym') + ' · ' + pg.ex.length + ' ex' + (used[k] ? '' : ' · not this phase')} forceOpen={editing}>
              {!editing ? (
                <>
                  {pg.ex.map((l, i) => { const e = exParts(l); return (
                    <Text key={i} style={{ fontFamily: font.regular, fontSize: 13.5, color: c.ink2 }}>{i + 1}. {e.n}<Text style={{ fontFamily: font.semibold, fontSize: 12, color: c.muted }}>  {e.s}</Text></Text>
                  ); })}
                  <View style={{ flexDirection: 'row' }}><Mini label="Edit exercises" onPress={() => { setEditKey(k); setRows(pg.ex.map((l) => { const e = exParts(l); return { n: e.n, s: e.s }; })); }} /></View>
                </>
              ) : (
                <View style={{ gap: 7 }}>
                  {rows.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <TextInput style={[s.input, { flex: 1, minHeight: 40, fontSize: 13.5 }]} value={r.n} maxLength={90} accessibilityLabel={`Exercise ${i + 1} name`}
                        onChangeText={(v) => setRows((o) => o.map((x, j) => (j === i ? { ...x, n: v } : x)))} />
                      <TextInput style={[s.input, { width: 92, minHeight: 40, fontSize: 12.5 }]} value={r.s} maxLength={30} accessibilityLabel={`Exercise ${i + 1} sets and reps`}
                        onChangeText={(v) => setRows((o) => o.map((x, j) => (j === i ? { ...x, s: v } : x)))} />
                      <Mini icon="trash" onPress={() => (rows.length > 1 ? setRows((o) => o.filter((_, j) => j !== i)) : toast('A session needs at least one exercise'))} style={{ width: 36, minHeight: 36 }} />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row' }}><Mini label="+ exercise" onPress={() => setRows((o) => [...o, { n: 'New exercise', s: '3 × 10' }])} /></View>
                  <Cue>Sets and reps read like <Text style={{ fontFamily: font.bold }}>3 × 8-10</Text>. Renaming an exercise starts its history fresh, because past sets are matched by name.</Cue>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable style={[s.primary, { flex: 1, minHeight: 44 }]} onPress={saveSession}><Text style={s.primaryText}>Save session</Text></Pressable>
                    <Mini label="Cancel" onPress={() => setEditKey(null)} />
                  </View>
                </View>
              )}
            </SessionRow>
          );
        })}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {hasSaved && <Mini label="Restore previous plan" onPress={async () => { try { await db.restorePreviousPlan(); await after('Previous plan restored'); } catch (e) { toast((e as Error).message); } }} />}
          {PL.by !== 'default' && <Mini label="Back to the original" onPress={async () => {
            try { await db.savePlanVersion({ body: null, source: 'you', note: 'Back to the original', kcal: G.kcal, protein: G.protein }); await reload(); touch(); undoToast('Back to the original plan', async () => { await db.restorePreviousPlan(); await reload(); touch(); }); } catch (e) { toast((e as Error).message); }
          }} />}
        </View>
        <AskClaude keyed={keyed} />
      </View>
      <View style={s.card}><Fold title="All four phases" big><Phases /></Fold></View>
    </View>
  );
}

function SessionRow({ title, meta, children, forceOpen }: { title: string; meta: string; children: React.ReactNode; forceOpen: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen;
  return (
    <View style={{ borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, backgroundColor: c.surface2, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 12 }} accessibilityState={{ expanded: shown }}>
        <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 15, color: c.ink }}>{title}</Text>
        <Text style={{ fontFamily: font.bold, fontSize: 10, color: c.muted }}>{meta}</Text>
      </Pressable>
      {shown && <View style={{ paddingHorizontal: 13, paddingBottom: 12, gap: 5 }}>{children}</View>}
    </View>
  );
}

/** r19 renderPhases: each phase with its dates, then the bloods, milestones and the day itself. */
function Phases() {
  const { engine, maxDay } = useRecomp();
  const { c } = useTheme();
  const { T, PL, G } = engine;
  const P = engine.plan(maxDay);
  const marks = [...Object.keys(T.LABS).map((k) => [k, 'Lab checkpoint', T.LABS[k], 'med']), ...Object.keys(T.TASKS).map((k) => [k, 'Milestone', T.TASKS[k], 'task'])].sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const Row = ({ when, what, detail, tone }: { when: string; what: string; detail: string; tone?: 'now' | 'med' | 'task' }) => (
    <View style={{ paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: tone === 'now' ? c.cat.move.fill : tone === 'med' ? c.danger : tone === 'task' ? c.warn : c.line, paddingVertical: 4, gap: 2 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>{when}</Text>
      <Text style={{ fontFamily: font.bold, fontSize: 14.5, color: c.ink }}>{what}</Text>
      <Text style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: c.ink2 }}>{detail}</Text>
    </View>
  );
  return (
    <View style={{ gap: 12 }}>
      {PL.phases.map((ph, i) => {
        const [w0, w1] = T.TPHASE_W[i];
        const a = addDays(d(T.TSTART), (w0 - 1) * 7), b = addDays(d(T.TSTART), Math.min(T.TTOTAL - 1, w1 * 7 - 1));
        const now = P.inRange && P.week >= w0 && P.week <= w1;
        return (
          <View key={i} style={{ gap: 12 }}>
            <Row when={`${shortDate(a)} – ${shortDate(b)}  ·  Weeks ${w0}–${w1}${now ? '  ·  YOU ARE HERE' : ''}`} what={ph.name} detail={ph.detail} tone={now ? 'now' : undefined} />
            {marks.filter((m) => { const wkOf = Math.floor(diffDays(d(T.TSTART), d(m[0])) / 7) + 1; return wkOf >= w0 && wkOf <= w1; }).map((m) => (
              <Row key={m[0] + m[1]} when={shortDate(d(m[0]))} what={m[1]} detail={m[2]} tone={m[3] as 'med' | 'task'} />
            ))}
          </View>
        );
      })}
      {!!G.event && <Row when={shortDate(d(G.event))} what={G.name || 'The day'} detail="The day this goal is for." tone="task" />}
    </View>
  );
}

/** Me > Targets (r19 builds it in renderPlanView from the phase picked on the Plan page). */
export function TargetsTab({ toast }: { toast: (t: string) => void }) {
  const { engine, maxDay, reload, touch } = useRecomp();
  const { c, s } = useTheme('move');
  const { PL, G, PROFILE } = engine;
  const P = engine.plan(maxDay);
  const [sel] = usePhaseSel(P.inRange ? P.phase : 1);
  const pi = sel - 1, ph = PL.phases[pi];
  const [edit, setEdit] = useState(false);
  const T: [string, string, number, string][] = [['kcal', 'Calories', G.kcal || 2200, 'kcal'], ['protein', 'Protein', G.protein || 180, 'g'], ['steps', 'Steps · Phase ' + (pi + 1), ph.steps, ''],
    ['carb', 'Carbs', PL.targets.carb, 'g'], ['fat', 'Fat', PL.targets.fat, 'g'], ['fiber', 'Fiber', PL.targets.fiber, 'g']];
  const [vals, setVals] = useState<Record<string, string>>({});
  const floor = kcalFloor(PROFILE);
  const save = async () => {
    const v = (id: string, lo: number, hi: number, dflt: number) => { const x = Math.round(+vals[id]); return x >= lo && x <= hi ? x : dflt; };
    const kc = v('kcal', floor, 4500, G.kcal), pr = v('protein', 60, 320, G.protein), stp = v('steps', 2000, 30000, ph.steps);
    const np = clonePlan(PL);
    np.targets = { carb: v('carb', 50, 500, PL.targets.carb), fat: v('fat', 20, 200, PL.targets.fat), fiber: v('fiber', 10, 80, PL.targets.fiber) };
    np.phases[pi].steps = stp;
    const changed = stable(np.targets) !== stable(PL.targets) || stp !== ph.steps;
    setEdit(false);
    try {
      if (changed) await db.savePlanVersion({ body: { ...np, by: 'you', at: Date.now(), note: 'Targets edited' }, source: 'you', note: 'Targets edited', kcal: kc, protein: pr });
      else if (G.id) await db.updateGoalTargets(G.id, { kcal: kc, protein_g: pr });
      await reload(); touch(); toast('Targets saved');
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <View style={s.card}>
      <PanelHead title="Daily targets" right={<Mini label={edit ? 'Cancel' : 'Edit'} onPress={() => { setEdit((e) => !e); setVals(Object.fromEntries(T.map((t) => [t[0], String(t[2])]))); }} />} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {T.map((t) => (
          <View key={t[0]} style={{ width: '31.5%', flexGrow: 1, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.lineSoft, gap: 3 }}>
            <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 9.5, color: c.muted }}>{t[1]}</Text>
            {edit ? (
              <TextInput style={{ fontFamily: font.bold, fontSize: 15, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: c.line, borderRadius: 8, backgroundColor: c.surface, color: c.ink }}
                value={vals[t[0]]} onChangeText={(x) => setVals((o) => ({ ...o, [t[0]]: x }))} keyboardType="number-pad" accessibilityLabel={t[1]} />
            ) : (
              <Text style={{ fontFamily: font.bold, fontSize: 17, color: c.ink, letterSpacing: -0.3 }}>{Number(t[2]).toLocaleString('en-US')}{t[3] ? <Text style={{ fontSize: 11, color: c.muted }}> {t[3]}</Text> : null}</Text>
            )}
          </View>
        ))}
      </View>
      {edit ? (
        <>
          <Pressable style={s.primary} onPress={save}><Text style={s.primaryText}>Save targets</Text></Pressable>
          <Cue>Calories stay at {floor.toLocaleString('en-US')} or above; change that floor under About you.</Cue>
        </>
      ) : <Cue>Steps follow the phase picked on the Plan page. Each phase can have its own.</Cue>}
    </View>
  );
}

/** "Ask Claude to change it", and proposals from the Claude connector (r19 renderPlanAI). */
function AskClaude({ keyed }: { keyed: boolean }) {
  const { engine, maxDay, reload, touch } = useRecomp();
  const { D } = useDays();
  const { c, s } = useTheme('move');
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [fromClaude, setFromClaude] = useState<db.ProposalRow[]>([]);
  useEffect(() => { db.listPendingProposals().then(setFromClaude).catch(() => {}); }, [engine]);
  const { PL, T } = engine;
  const wn = planWeekdays(T.TSTART);
  const go = async () => {
    const req = ask.trim();
    if (!req) return setStatus('Say what should change first.');
    setBusy(true); setStatus('This usually takes under a minute.');
    try { setProposal(await proposePlan(req.slice(0, 600), engine, D, engine.PROFILE, maxDay)); setStatus(null); }
    catch (e) { setStatus((e as { code?: string }).code === 'invalid_json' ? "Claude's answer did not fit the plan format. Try again, or say it more simply." : aiMessage(e)); }
    finally { setBusy(false); }
  };
  const box = { borderWidth: 1.5, borderColor: c.cat.move.fill, backgroundColor: c.cat.move.soft, borderRadius: 16, padding: 14, gap: 8 } as const;
  return (
    <View style={{ gap: 10, marginTop: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.lineSoft }}>
      {fromClaude.map((p) => {
        const np = normPlan(p.body);
        const diff = np ? planDiff(PL, np, p.kcal ?? engine.G.kcal, p.protein_g ?? engine.G.protein, engine.G.kcal, engine.G.protein, wn) : [];
        return (
          <View key={p.id} style={box}>
            <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>Proposed from your Claude chat</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 17, color: c.ink }}>{p.summary}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>What actually changes</Text>
            {np ? (diff.length ? diff.map((x, i) => <Text key={i} style={s.body}>• {x}</Text>) : <Text style={s.body2}>Nothing compared with your current plan.</Text>)
              : <Text style={s.error}>This proposal no longer fits the plan format.</Text>}
            <View style={s.row}>
              {np && diff.length > 0 && (
                <Pressable style={[s.primary, { flex: 1, minHeight: 44 }]} onPress={async () => {
                  try {
                    await db.savePlanVersion({ body: np, source: 'claude', note: p.summary.slice(0, 140), kcal: p.kcal, protein: p.protein_g });
                    await db.decideProposal(p.id, 'applied'); setFromClaude((o) => o.filter((x) => x.id !== p.id));
                    setStatus('New plan in use. Restore previous puts the old one back.'); await reload(); touch();
                  } catch (e) { setStatus((e as Error).message); }
                }}><Text style={s.primaryText}>Use this plan</Text></Pressable>
              )}
              <Mini label="Discard" onPress={() => db.decideProposal(p.id, 'dismissed').then(() => setFromClaude((o) => o.filter((x) => x.id !== p.id)))} />
            </View>
          </View>
        );
      })}
      {proposal ? (
        <View style={box}>
          <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>Proposal from Claude</Text>
          <Text style={{ fontFamily: font.bold, fontSize: 17, color: c.ink }}>{proposal.summary || 'A revised plan'}</Text>
          {proposal.changes.map((x, i) => <Text key={i} style={s.body2}>• {x}</Text>)}
          <View style={{ marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.line, gap: 4 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>What actually changes</Text>
            {proposal.diff.length ? proposal.diff.map((x, i) => <Text key={i} style={s.body}>• {x}</Text>) : <Text style={s.body2}>Nothing. The proposal is the same as your current plan.</Text>}
          </View>
          <View style={s.row}>
            {proposal.diff.length > 0 && <Pressable style={[s.primary, { flex: 1, minHeight: 44 }]} onPress={async () => {
              try { await acceptProposal(proposal); setProposal(null); setAsk(''); setStatus(null); await reload(); touch(); undoToast('New plan in use', async () => { await db.restorePreviousPlan(); await reload(); touch(); }); }
              catch (e) { setStatus((e as Error).message); }
            }}><Text style={s.primaryText}>Use this plan</Text></Pressable>}
            <Mini label="Discard" onPress={() => { setProposal(null); setStatus('Proposal discarded.'); }} />
          </View>
          <Cue>Your logged sets, food and habits stay as they are. You can restore the current plan afterwards.</Cue>
        </View>
      ) : (
        <>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: c.ink }}>Ask Claude to change it</Text>
          <Cue>Say what is going on. Claude reads this plan, your goal and the last two weeks of logs, and proposes a revised plan for you to accept or discard.</Cue>
          <TextInput style={[s.input, { minHeight: 78, textAlignVertical: 'top', paddingTop: 10 }]} multiline maxLength={600} value={ask} onChangeText={setAsk}
            placeholder="e.g. My left knee hurts on split squats. Or: I travel every Thursday now." placeholderTextColor={c.muted} />
          <View style={{ gap: 6, alignItems: 'flex-start' }}>
            {PLAN_CHIPS.map((t) => (
              <Pressable key={t} onPress={() => setAsk((x) => (x.trim() ? x.trim() + ' ' : '') + t + '. ')}
                style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 12.5, color: c.ink }}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[s.primary, (busy || !keyed) && { backgroundColor: c.surface2 }]} disabled={busy || !keyed} onPress={go}>
            <Text style={[s.primaryText, (busy || !keyed) && { color: c.muted }]}>{busy ? 'Claude is working on it…' : 'Build a proposal'}</Text>
          </Pressable>
          {!keyed && <Cue>Add your Anthropic API key in Settings, or ask Claude through the Recomp connector: its plan proposals show up here.</Cue>}
        </>
      )}
      {status && <Cue>{status}</Cue>}
    </View>
  );
}

export { Icon };
