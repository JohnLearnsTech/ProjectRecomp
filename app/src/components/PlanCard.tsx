import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { aiMessage, PLAN_CHIPS, planWeekdays, type Proposal } from '../domain/ai';
import { d, addDays, shortDate, key } from '../domain/dates';
import { acceptProposal, proposePlan } from '../lib/ai';
import { normPlan } from '../domain/plan';
import { planDiff } from '../domain/ai';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

/** Me, Your plan: the phases and sessions, and "Ask Claude to change it" (r19 renderPlanAI). */
export function PlanCard({ keyed }: { keyed: boolean }) {
  const { engine, maxDay, reload, touch } = useRecomp();
  const { D } = useDays();
  const { c, s } = useTheme('train');
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [hasSaved, setHasSaved] = useState<boolean | null>(null);
  const [fromClaude, setFromClaude] = useState<db.ProposalRow[]>([]);
  useEffect(() => { db.listPendingProposals().then(setFromClaude).catch(() => {}); }, [engine]);
  const { PL, T } = engine;
  const wn = planWeekdays(T.TSTART);
  useEffect(() => { if (hasSaved === null) db.getCurrentPlan().then((p) => setHasSaved(!!p)).catch(() => setHasSaved(false)); }, [hasSaved]);

  const go = async () => {
    const req = ask.trim();
    if (!req) return setStatus('Say what should change first.');
    setBusy(true); setStatus('This usually takes under a minute.');
    try { setProposal(await proposePlan(req.slice(0, 600), engine, D, engine.PROFILE, maxDay)); setStatus(null); }
    catch (e) { setStatus((e as { code?: string }).code === 'invalid_json' ? "Claude's answer did not fit the plan format. Try again, or say it more simply." : aiMessage(e)); }
    finally { setBusy(false); }
  };
  const accept = async () => {
    if (!proposal) return;
    try { await acceptProposal(proposal); setProposal(null); setAsk(''); setHasSaved(true); setStatus('New plan in use. Restore previous puts the old one back.'); await reload(); touch(); }
    catch (e) { setStatus((e as Error).message); }
  };
  const restore = async () => {
    try { await db.restorePreviousPlan(); setHasSaved(null); setStatus('Previous plan restored.'); await reload(); touch(); }
    catch (e) { setStatus((e as Error).message); }
  };

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Your plan</Text>
      <Text style={s.label}>{PL.by === 'default' ? 'The default protocol for your setup answers.' : PL.by === 'claude' ? `Built with Claude${PL.note ? `: “${PL.note}”` : ''}.` : PL.note || 'Edited by you.'}</Text>
      <Text style={s.body2}>Targets: carbs {PL.targets.carb} g, fat {PL.targets.fat} g, fiber {PL.targets.fiber} g a day.</Text>
      {PL.phases.map((ph, i) => {
        const [w0, w1] = T.TPHASE_W[i];
        const from = key(addDays(d(T.TSTART), (w0 - 1) * 7)), to = key(addDays(d(T.TSTART), Math.min(T.TTOTAL, w1 * 7) - 1));
        return (
          <View key={i} style={{ borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 10, gap: 4 }}>
            <Text style={[s.body, { fontFamily: font.semibold }]}>{ph.name}</Text>
            <Text style={s.label}>Weeks {w0}–{w1} · {shortDate(d(from))} to {shortDate(d(to))} · {ph.steps.toLocaleString('en-IN')} steps</Text>
            <Text style={s.label}>{ph.weeks[0].map((sl, j) => `${wn[j]} ${sl.t === 'lift' ? PL.programs[sl.s]?.name ?? sl.s : sl.t}`).join(' · ')}</Text>
          </View>
        );
      })}
      <View style={{ borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 10, gap: 4 }}>
        {Object.entries(PL.programs).map(([k, pg]) => (
          <Text key={k} style={s.label}><Text style={{ fontFamily: font.semibold, color: c.ink }}>{pg.name}</Text>: {pg.ex.map((l) => l.split('|')[0]).join(', ')}</Text>
        ))}
      </View>

      {fromClaude.map((p) => {
        const np = normPlan(p.body);
        const diff = np ? planDiff(PL, np, p.kcal ?? engine.G.kcal, p.protein_g ?? engine.G.protein, engine.G.kcal, engine.G.protein, wn) : [];
        return (
          <View key={p.id} style={{ backgroundColor: c.cat.train.soft, borderRadius: 14, padding: 14, gap: 8 }}>
            <Text style={[s.label, { fontFamily: font.semibold }]}>Proposed from your Claude chat</Text>
            <Text style={s.section}>{p.summary}</Text>
            <Text style={[s.label, { fontFamily: font.semibold }]}>What actually changes</Text>
            {np ? (diff.length ? diff.map((x, i) => <Text key={i} style={s.body}>• {x}</Text>) : <Text style={s.body2}>Nothing compared with your current plan.</Text>)
              : <Text style={s.error}>This proposal no longer fits the plan format.</Text>}
            <View style={s.row}>
              {np && diff.length > 0 && (
                <Pressable style={[s.primary, { flex: 1 }]} onPress={async () => {
                  try {
                    await db.savePlanVersion({ body: np, source: 'claude', note: p.summary.slice(0, 140), kcal: p.kcal, protein: p.protein_g });
                    await db.decideProposal(p.id, 'applied'); setFromClaude((o) => o.filter((x) => x.id !== p.id)); setHasSaved(true);
                    setStatus('New plan in use. Restore previous puts the old one back.'); await reload(); touch();
                  } catch (e) { setStatus((e as Error).message); }
                }}><Text style={s.primaryText}>Use this plan</Text></Pressable>
              )}
              <Pressable style={[s.outline, { flex: 1 }]} onPress={() => db.decideProposal(p.id, 'dismissed').then(() => setFromClaude((o) => o.filter((x) => x.id !== p.id)))}>
                <Text style={s.outlineText}>Discard</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {proposal ? (
        <View style={{ backgroundColor: c.cat.train.soft, borderRadius: 14, padding: 14, gap: 8 }}>
          <Text style={[s.label, { fontFamily: font.semibold }]}>Proposal from Claude</Text>
          <Text style={s.section}>{proposal.summary || 'A revised plan'}</Text>
          {proposal.changes.map((x, i) => <Text key={i} style={s.body2}>• {x}</Text>)}
          <Text style={[s.label, { fontFamily: font.semibold, marginTop: 6 }]}>What actually changes</Text>
          {proposal.diff.length ? proposal.diff.map((x, i) => <Text key={i} style={s.body}>• {x}</Text>) : <Text style={s.body2}>Nothing. The proposal is the same as your current plan.</Text>}
          <View style={s.row}>
            {proposal.diff.length > 0 && <Pressable style={[s.primary, { flex: 1 }]} onPress={accept}><Text style={s.primaryText}>Use this plan</Text></Pressable>}
            <Pressable style={[s.outline, { flex: 1 }]} onPress={() => { setProposal(null); setStatus('Proposal discarded.'); }}><Text style={s.outlineText}>Discard</Text></Pressable>
          </View>
          <Text style={s.label}>Your logged sets, food and habits stay as they are. You can restore the current plan afterwards.</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={s.section}>Ask Claude to change it</Text>
          <Text style={s.body2}>Say what is going on. Claude reads this plan, your goal and the last two weeks of logs, and proposes a revised plan for you to accept or discard.</Text>
          <TextInput style={[s.input, { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]} multiline maxLength={600} value={ask} onChangeText={setAsk}
            placeholder="My left knee hurts on split squats. Or: I travel every Thursday now." placeholderTextColor={c.muted} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PLAN_CHIPS.map((t) => (
              <Pressable key={t} onPress={() => setAsk((a) => (a.trim() ? a.trim() + ' ' : '') + t + '. ')} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: c.surface2 }}>
                <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.ink2 }}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[s.primary, (busy || !keyed) && { opacity: 0.5 }]} disabled={busy || !keyed} onPress={go}>
            <Text style={s.primaryText}>{busy ? 'Claude is working on it…' : 'Build a proposal'}</Text>
          </Pressable>
          {!keyed && <Text style={s.label}>Add your Anthropic API key under AI below to use this.</Text>}
        </View>
      )}
      {status && <Text style={s.body2}>{status}</Text>}
      {hasSaved && !proposal && (
        <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={restore}><Text style={s.outlineText}>Restore previous plan</Text></Pressable>
      )}
    </View>
  );
}
