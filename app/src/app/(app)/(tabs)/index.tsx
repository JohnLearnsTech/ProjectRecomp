import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bar } from '../../../components/Bar';
import { Ring } from '../../../components/Ring';
import { ScreenHeader } from '../../../components/ScreenHeader';
import floors from '../../../domain/data/floors.json';
import { d, diffDays, shortDate } from '../../../domain/dates';
import { currentQuote, nextQuote } from '../../../domain/quotes';
import * as db from '../../../lib/db';
import { evidence, latestWeight, trainedOn, useHistory } from '../../../lib/history';
import { useRecomp } from '../../../lib/recomp';
import { font, useTheme } from '../../../lib/theme';

const n = (x: number) => Math.round(x).toLocaleString('en-IN');

export default function Today() {
  const { engine, day, maxDay, rev, reload, error } = useRecomp();
  const { c, s } = useTheme('move');
  const h = useHistory();
  const [log, setLog] = useState<db.DayLog | null>(null);
  const [quote, setQuote] = useState(currentQuote());

  useEffect(() => { db.getDayLog(day).then(setLog).catch(() => setLog(null)); }, [day, rev]);
  // Quotes rotate every 3 minutes; tapping the card advances.
  useEffect(() => { const t = setInterval(() => setQuote(nextQuote()), 180000); return () => clearInterval(t); }, [quote]);

  const { G, T, NAMES, LIFTS } = engine;
  const P = engine.plan(day);
  const future = day > maxDay, past = day < maxDay;

  // ── hero ──
  const kc = log?.kcal_total ?? 0, pr = log?.protein_total_g ?? 0, hasFood = kc > 0 || pr > 0, steps = log?.steps ?? 0;
  const kLeft = Math.round(P.kcal - kc), pLeft = Math.max(0, Math.round(P.protein - pr));
  const head = P.type === 'lift' ? NAMES[P.session!] : P.type === 'cardio' ? 'Cardio and steps' : 'Rest day';
  const trained = trainedOn(h, day);
  const state = future ? 'Preview' : past ? `Backfilling ${shortDate(d(day))}` : 'Today';
  const dayN = diffDays(d(T.START), d(day)) + 1;

  // ── goal ring (r19 renderFuel) ──
  const nowKg = latestWeight(h);
  const toGo = Math.abs(T.START_KG - T.TARGET_KG);
  const moved = nowKg != null ? (T.TARGET_KG > T.START_KG ? nowKg - T.START_KG : T.START_KG - nowKg) : 0;
  const pct = toGo > 0 && nowKg != null ? Math.max(0, Math.min(100, (moved / toGo) * 100)) : 0;
  const chips = evidence(h, T.START_KG, T.START, maxDay);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }} edges={['top']}>
      <ScrollView contentContainerStyle={s.screen} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        <ScreenHeader title="Today" />
        {error && <Text style={s.error}>{error}</Text>}

        <View style={[s.card, { borderTopWidth: 4, borderTopColor: c.cat.move.fill }]}>
          {!P.inRange ? (
            <>
              <Text style={s.label}>{P.idx < 0 ? 'Before the start line' : 'Plan finished'}</Text>
              <Text style={s.cardTitle}>{P.idx < 0 ? `The plan starts ${shortDate(d(T.START))}` : `${G.name || 'This goal'} is behind you`}</Text>
              <Text style={s.body2}>{P.idx < 0 ? 'Use the strip above to look ahead at the first week.' : 'Open Me to close this goal and set the next one.'}</Text>
            </>
          ) : (
            <>
              <Text style={s.label}>{(state === 'Today' ? '' : state + ', ') + `Day ${dayN} of ${T.TOTAL}, Phase ${P.phase}`}</Text>
              <View style={{ gap: 2 }}>
                <Text style={s.cardTitle}>{head}</Text>
                {P.type === 'lift' && LIFTS[P.session!] && <Text style={s.label}>{LIFTS[P.session!].length} exercises</Text>}
              </View>
              {P.type === 'lift' && (trained ? (
                <HeroRow done title="Session" text={`${NAMES[P.session!]} logged`} />
              ) : !future ? (
                <Pressable style={[s.primary, { backgroundColor: c.cat.train.fill }]} onPress={() => router.push('/session')} accessibilityRole="button">
                  <Text style={[s.primaryText, { color: c.cat.train.on }]}>▶  Start session</Text>
                </Pressable>
              ) : null)}
              {P.type === 'cardio' && (
                <HeroRow done={steps >= P.steps} title="Cardio" text={P.cardio}
                  action={steps >= P.steps || future ? undefined : { label: 'Log steps', onPress: () => router.push('/quick') }} />
              )}
              {P.type === 'rest' && <HeroRow title="Rest day" text={floors.rest} />}
              <View style={s.hairline} />
              <View style={[s.row, { gap: 14 }]}>
                <Tile value={n(Math.abs(kLeft))} label={kLeft >= 0 ? 'kcal left' : 'kcal over'} frac={kc / (P.kcal || 1)} color={kLeft < 0 ? c.warn : c.cat.food.fill} onPress={() => router.navigate('/food')} />
                <Tile value={String(pLeft)} label="g protein to go" frac={pr / (P.protein || 1)} color={c.cat.protein.fill} onPress={() => router.navigate('/food')} ok={hasFood && pLeft === 0} />
                <Tile value={n(steps)} label={`of ${n(P.steps)} steps`} frac={steps / (P.steps || 1)} color={c.cat.move.fill} onPress={() => router.push('/quick')} ok={steps >= P.steps} />
              </View>
            </>
          )}
        </View>

        <Pressable onPress={() => setQuote(nextQuote())} accessibilityLabel="Next quote"
          style={[s.card, { backgroundColor: c.pauseBg, gap: 14 }]}>
          <Text style={[s.label, { color: c.pauseInk, opacity: 0.7 }]}>
            {P.inRange ? `Day ${dayN} · for when you don't feel like it` : "For the days you don't feel like it"}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Text style={{ flex: 1, color: c.pauseInk, fontFamily: font.bold, fontSize: quote.q.length > 100 ? 21 : 26, lineHeight: quote.q.length > 100 ? 26 : 31 }}>
              {quote.q}
            </Text>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute' }}>
                  <Ring pct={pct} size={112} color={c.cat.move.fill} track="#ffffff22" />
                </View>
                <Text style={{ color: c.pauseInk, fontFamily: font.bold, fontSize: 24 }}>{nowKg == null ? '—' : `${Math.round(pct)}%`}</Text>
              </View>
              <Text style={{ color: c.pauseInk, opacity: 0.7, fontSize: 12, fontFamily: font.medium }}>Of goal</Text>
            </View>
          </View>
          <Text style={{ color: c.pauseInk, opacity: 0.7, fontFamily: font.regular, fontSize: 15 }}>{quote.by}</Text>
          <View style={{ height: 1, backgroundColor: '#ffffff1f' }} />
          <Text style={{ color: c.pauseInk, opacity: 0.7, fontFamily: font.regular, fontSize: 14 }}>Your own evidence</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(chips.length ? chips : [{ b: '', t: 'Nothing logged yet. Day one is the only day that is purely a decision.' }]).map((ch, i) => (
              <View key={i} style={{ borderRadius: 999, borderWidth: 1, borderColor: '#ffffff33', paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ color: c.pauseInk, fontFamily: font.regular, fontSize: 13 }}>
                  {ch.before === false || !ch.before ? ch.t : ''}
                  {ch.b ? <Text style={{ fontFamily: font.bold }}>{ch.b}</Text> : null}
                  {ch.before ? ch.t : ''}
                </Text>
              </View>
            ))}
          </View>
        </Pressable>

        <Text style={[s.label, { marginTop: 8 }]}>
          Recomp is a training, nutrition and habits tool. Its targets come from standard formulas and your own logs; they are not medical advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ value, label, frac, color, onPress, ok }: { value: string; label: string; frac: number; color: string; onPress: () => void; ok?: boolean }) {
  const { c, s } = useTheme('move');
  return (
    <Pressable style={{ flex: 1, gap: 6 }} onPress={onPress} accessibilityLabel={`${value} ${label}`}>
      <Text style={[s.stat, ok && { color: c.cat.move.ink }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.label} numberOfLines={2}>{label}</Text>
      <Bar frac={frac} color={color} />
    </Pressable>
  );
}

function HeroRow({ title, text, done, action }: { title: string; text: string; done?: boolean; action?: { label: string; onPress: () => void } }) {
  const { c, s } = useTheme('move');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.cat.move.fill : c.lineSoft }}>
        <Text style={{ color: done ? c.cat.move.on : c.muted, fontSize: 13, fontFamily: font.bold }}>{done ? '✓' : '·'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.body, { fontFamily: font.semibold }]}>{title}</Text>
        <Text style={s.body2}>{text}</Text>
      </View>
      {action && (
        <Pressable style={[s.outline, { minHeight: 40 }]} onPress={action.onPress}>
          <Text style={s.outlineText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
