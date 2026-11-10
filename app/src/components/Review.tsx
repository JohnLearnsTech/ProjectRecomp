import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { aiMessage, reviewDue, type ReviewOut } from '../domain/ai';
import { d, shortDate } from '../domain/dates';
import { applyReviewChange, hasKey, runReview } from '../lib/ai';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';
import { Icon } from './Icon';
import { Mini, PanelHead } from './ui';
import { handOffToClaude } from '../lib/connector';

const REVIEW_ASK = 'Run my weekly review in Project Recomp and save it to the app.';

/** r19 Weekly review: Claude's grade and words, beside a scorecard the app counts itself. */
export function ReviewCard() {
  const { engine, maxDay, rev, reload, touch } = useRecomp();
  const { D } = useDays();
  const { c, s } = useTheme('body');
  const [review, setReview] = useState<db.ReviewRow | null>(null);
  const [keyed, setKeyed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    db.getLatestReview().then(setReview).catch(() => {});
    hasKey().then(setKeyed).catch(() => {});
    db.getActiveGoal().then((g) => setGoalId(g?.id ?? null)).catch(() => {});
    db.getCurrentPlan().then((p) => setSaved(!!p)).catch(() => {});
  }, [rev]);

  const go = async () => {
    setBusy(true); setErr(null);
    try { await runReview(engine, D, engine.PROFILE, maxDay); setReview(await db.getLatestReview()); touch(); }
    catch (e) { setErr(aiMessage(e)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!review || !goalId) return;
    try { await applyReviewChange(review, engine, goalId, maxDay, saved); await reload(); touch(); setReview(await db.getLatestReview()); }
    catch (e) { setErr((e as Error).message); }
  };
  // Without a key the review runs in Claude through the connector, which saves it back here;
  // the app refetches when it comes back to the foreground.
  const due = reviewDue(engine.T.START, maxDay, review?.end_date ?? null);
  const o: ReviewOut | null = review?.out ?? null, st = review?.stats ?? {};
  const nd = st.daysInWeek || 7;
  let hm = 0, ho = 0; (st.habits || []).forEach((x: { met: number; of: number }) => { hm += x.met; ho += x.of; });
  const card = (k: string, v: string | null, ok: boolean | null) => v == null ? null : (
    <View key={k} style={{ width: '48.5%', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: ok === false ? c.danger : c.lineSoft, backgroundColor: c.surface2, gap: 2 }}>
      <Text style={{ fontFamily: font.regular, fontSize: 12, color: c.ink2 }}>{k}</Text>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: ok === false ? c.danger : c.cat.body.ink }}>{v}</Text>
    </View>
  );
  const gradeBg = (g: string) => (g[0] === 'A' || g[0] === 'B' ? c.cat.habit.fill : g[0] === 'C' ? c.cat.food.fill : c.warn);
  const ch: { kcal: number } | { steps: number } | null = review ? (review.change_kcal ? { kcal: review.change_kcal } : review.change_steps ? { steps: review.change_steps } : null) : null;

  return (
    <View style={s.card}>
      <PanelHead title="Weekly review" info={{ label: 'About the weekly review', text: 'Claude reads your last seven days against the seven before and suggests at most one change. A calorie cut is only offered when the seven-day average has stalled and food was logged on at least five days. Nothing changes until you press Apply.' }}
        right={<Mini label={busy ? 'Reviewing…' : !keyed ? 'Review with Claude' : o ? (due ? 'Review this week' : 'Review again') : 'Review my week'} disabled={busy} onPress={keyed ? go : () => handOffToClaude(REVIEW_ASK)} />} />
      {review && <Text style={[s.label, { marginTop: -6 }]}>{shortDate(d(review.start_date))} – {shortDate(d(review.end_date))} · reviewed {shortDate(d(review.created_at.slice(0, 10)))}</Text>}
      {busy && <Text style={s.body2}>Claude is reading your week. About half a minute.</Text>}
      {err && <Text style={s.error}>{err}</Text>}
      {!o && !busy && (
        <Text style={s.body2}>Claude grades your last seven days against the plan, names every target you missed and on which day, and sets three non-negotiables for next week. No sugar-coating. {keyed ? 'Takes about half a minute.' : 'Tap Review with Claude: it opens Claude, which reads your week through the Project Recomp connector and saves the review here. Come back to the app to see it.'}</Text>
      )}
      {o && (
        <>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {o.grade ? <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: gradeBg(o.grade), alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Grade ${o.grade}`}>
              <Text style={{ fontFamily: font.bold, fontSize: 24, color: '#101210' }}>{o.grade}</Text></View> : null}
            <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 19, lineHeight: 24, color: c.ink }}>{o.headline}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[card('Sessions', st.liftScheduled ? `${st.liftDone} of ${st.liftScheduled}` : null, st.liftScheduled ? st.liftDone >= st.liftScheduled : null),
              card('Protein floor', st.proteinFloorDays != null ? `${st.proteinFloorDays} of ${nd} days` : null, st.proteinFloorDays != null ? st.proteinFloorDays >= nd : null),
              card('Calories', st.kcalAvg != null ? `${st.kcalAvg.toLocaleString('en-IN')} avg` : null, st.kcalAvg != null ? st.kcalOverDays === 0 && st.foodDays >= nd - 1 : null),
              card('Food logged', `${st.foodDays} of ${nd} days`, st.foodDays >= nd - 1),
              card('Steps target', st.stepsHitDays != null ? `${st.stepsHitDays} of ${nd} days` : null, st.stepsHitDays != null ? st.stepsHitDays >= nd - 1 : null),
              card('Sleep', st.sleepAvg != null ? `${st.sleepAvg} h avg` : null, st.sleepAvg != null ? st.sleepAvg >= 7 : null),
              card('Weigh-ins', `${st.weighIns} of ${nd}`, st.weighIns >= Math.min(5, nd)),
              card('Habits', ho ? `${Math.round((hm / ho) * 100)}%` : null, ho ? hm / ho >= 0.8 : null)]}
          </View>
          {(o.truths?.length ? o.truths : o.watch || []).length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={[s.label, { fontFamily: font.semibold }]}>{o.truths?.length ? 'Hard truths' : 'Watch'}</Text>
              {(o.truths?.length ? o.truths : o.watch).map((x, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.warnSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Text style={{ fontFamily: font.bold, fontSize: 11, color: c.warn }}>!</Text></View>
                  <Text style={[s.body2, { flex: 1, fontSize: 14 }]}>{x}</Text>
                </View>
              ))}
            </View>
          )}
          {o.leak ? <View style={{ backgroundColor: c.warnSoft, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.warn + '55', gap: 3 }}><Text style={{ fontFamily: font.regular, fontSize: 12, color: c.ink2 }}>Biggest leak</Text><Text style={[s.body, { fontFamily: font.semibold }]}>{o.leak}</Text></View> : null}
          {o.commitments?.length ? (
            <View style={{ gap: 4 }}>
              <Text style={[s.label, { fontFamily: font.semibold }]}>Non-negotiables for next week</Text>
              {o.commitments.map((x, i) => <Text key={i} style={[s.body, { fontSize: 15.5, fontFamily: font.medium }]}>{i + 1}. {x}</Text>)}
            </View>
          ) : o.focus ? <Text style={s.body}><Text style={{ fontFamily: font.semibold }}>Next week: </Text>{o.focus}</Text> : null}
          {o.wins?.length ? (
            <View style={{ gap: 4 }}>
              <Text style={[s.label, { fontFamily: font.semibold }]}>Earned</Text>
              {o.wins.map((x, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 9 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.cat.body.fill, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Icon name="check" size={12} stroke={3} color={c.cat.body.on} /></View>
                  <Text style={[s.body2, { flex: 1, fontSize: 14 }]}>{x}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {o.suggestion?.what ? (
            <View style={{ backgroundColor: c.cat.body.soft, borderRadius: 12, padding: 13, gap: 6, borderWidth: 1.5, borderColor: c.cat.body.fill }}>
              <Text style={[s.body, { fontFamily: font.bold, fontSize: 14.5 }]}>{o.suggestion.what}</Text>
              {o.suggestion.why ? <Text style={s.body2}>{o.suggestion.why}</Text> : null}
              {ch && (review?.applied_at ? <Text style={[s.label, { color: c.cat.move.ink, fontFamily: font.semibold }]}>Applied</Text> : (
                <Pressable style={s.primary} onPress={apply}>
                  <Text style={s.primaryText}>{'kcal' in ch ? `Apply: calories ${engine.G.kcal.toLocaleString('en-IN')} → ${ch.kcal.toLocaleString('en-IN')}` : `Apply: steps ${engine.plan(maxDay).steps.toLocaleString('en-IN')} → ${ch.steps.toLocaleString('en-IN')}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
