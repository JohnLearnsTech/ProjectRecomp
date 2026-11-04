import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayKey } from '../../domain/dates';
import {
  aboutYouProblem, calcTargets, EQUIP, GOAL_TYPES, HABIT_OPTS, habitOptLabel, STEP_CHOICES, WEEKS, type Answers,
} from '../../domain/onboarding';
import * as db from '../../lib/db';
import { BackupImport } from '../../components/BackupImport';
import { buildOnboarding } from '../../lib/onboarding';
import { useRecomp } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';

// r19 setup wizard: a hero, five questions, then a goal, targets and the default plan.
// Opens on its own when there is no goal; "Run setup again" in Me opens it at step 1.
const N = 5;

export default function Onboarding() {
  const { again } = useLocalSearchParams<{ again?: string }>();
  const isAgain = again === '1';
  const { engine, profileRow, reload } = useRecomp();
  const { c, s } = useTheme('move');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [step, setStep] = useState(isAgain ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const G = engine.G;
  const [A, setA] = useState<Answers>({
    name: profileRow?.name ?? '', sex: profileRow?.sex === 'female' || profileRow?.sex === 'male' ? profileRow.sex : '',
    age: profileRow?.age?.toString() ?? '', height: profileRow?.height_cm?.toString() ?? '', weight: '',
    type: (['lose', 'recomp', 'muscle', 'health'].includes(G.type) ? G.type : 'lose') as Answers['type'], weeks: 12, goalName: '', target: '',
    equip: G.homeFirst ? 'homefirst' : profileRow?.equipment ?? 'gym', days: profileRow?.training_days ?? 3,
    joint: profileRow?.joint_friendly ?? false, steps: 5000, cuisine: profileRow?.cuisine ?? '', habits: [],
  });
  useEffect(() => {
    db.latestWeightIn(G.start, G.due).then((w) => { if (w != null) setA((o) => (o.weight ? o : { ...o, weight: String(w) })); }).catch(() => {});
  }, [G.start, G.due]);
  // Prefill the target once the numbers it needs are in (r19 clears it when type, weeks, weight or height change).
  useEffect(() => {
    if (step === 2 && !A.target && A.weight && A.height && A.age) setA((o) => ({ ...o, target: String(calcTargets(o).targetKg) }));
  }, [step, A.target, A.weight, A.height, A.age]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); setMsg(null); }, [step]);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => {
    setMsg(null);
    setA((o) => ({ ...o, [k]: v, ...(k === 'type' || k === 'weeks' || k === 'weight' || k === 'height' ? { target: '' } : {}) }));
  };

  const next = () => {
    if (step === 1) { const bad = aboutYouProblem(A); if (bad) return setMsg(`Add your ${bad} to continue.`); }
    setStep(step + 1);
  };
  const finish = async () => {
    setBusy(true);
    try {
      await db.finishOnboarding(buildOnboarding(A, todayKey()));
      await reload();
      router.replace('/');
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };

  const t = step === N ? calcTargets(A) : null;
  const n = (x: number) => x.toLocaleString('en-IN');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.paper }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, minHeight: 56 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: c.cat.move.fill, borderWidth: 1.5, borderColor: c.cat.move.ink }} />
            <Text style={{ fontFamily: font.bold, fontSize: 22, color: c.ink }}>Recomp</Text>
          </View>
          {step > 0 && (
            <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step} of ${N}`}>
              {Array.from({ length: N }, (_, i) => (
                <View key={i} style={{ width: 26, height: 5, borderRadius: 3, backgroundColor: i < step ? c.cat.move.fill : c.lineSoft }} />
              ))}
            </View>
          )}
          {isAgain ? (
            <Pressable onPress={() => router.back()} accessibilityLabel="Close" hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, color: c.ink2 }}>✕</Text>
            </Pressable>
          ) : <View style={{ width: 44 }} />}
        </View>

        <ScrollView ref={scroll} contentContainerStyle={{ flexGrow: 1, padding: 20, gap: 14, justifyContent: step === 0 ? 'center' : 'flex-start' }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View style={{ gap: 16 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 44, lineHeight: 48, color: c.ink }}>Change the whole day, not just the scale.</Text>
              <Text style={[s.body2, { fontSize: 18, lineHeight: 27 }]}>
                Recomp brings your training, food, habits and sleep into one plan that adapts as you go. Five quick questions and you have yours.
              </Text>
              {!isAgain && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <Text style={s.label}>Used the Recomp web app? Restore its backup instead.</Text>
                  <BackupImport compact />
                </View>
              )}
            </View>
          )}

          {step === 1 && (
            <Q eyebrow="About you" title="The basics for your numbers">
              <View style={s.row}>
                <Field label="First name" value={A.name} onChange={(v) => set('name', v.slice(0, 30))} />
                <Field label="Age" value={A.age} onChange={(v) => set('age', v)} numeric />
              </View>
              <View style={s.row}>
                <Field label="Height (cm)" value={A.height} onChange={(v) => set('height', v)} numeric />
                <Field label="Weight today (kg)" value={A.weight} onChange={(v) => set('weight', v.replace(',', '.'))} numeric />
              </View>
              <Label>Sex, for the calorie estimate</Label>
              <Chips options={[['female', 'Female'], ['male', 'Male'], ['', 'Prefer not to say']]} value={A.sex} onChange={(v) => set('sex', v as Answers['sex'])} />
            </Q>
          )}

          {step === 2 && (
            <Q eyebrow="Your goal" title="What should change?">
              <Chips options={GOAL_TYPES} value={A.type} onChange={(v) => set('type', v as Answers['type'])} />
              <Label>How long for this first block</Label>
              <Chips options={WEEKS.map((w) => [String(w), `${w} weeks`])} value={String(A.weeks)} onChange={(v) => set('weeks', +v)} />
              <View style={s.row}>
                <Field label="Target weight (kg)" value={A.target} onChange={(v) => setA((o) => ({ ...o, target: v.replace(',', '.') }))} numeric />
                <Field label="Name it (optional)" value={A.goalName} onChange={(v) => set('goalName', v.slice(0, 30))} placeholder="Wedding, Summer, Me" />
              </View>
            </Q>
          )}

          {step === 3 && (
            <Q eyebrow="Training" title="Where and how often">
              <Chips options={EQUIP} value={A.equip} onChange={(v) => set('equip', v as Answers['equip'])} />
              <Label>Days a week you can train</Label>
              <Chips options={[2, 3, 4, 5].map((d) => [String(d), String(d)])} value={String(A.days)} onChange={(v) => set('days', +v)} compact />
              <Pressable onPress={() => set('joint', !A.joint)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }} accessibilityRole="switch" accessibilityState={{ checked: A.joint }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.row16, { fontFamily: font.semibold }]}>Go easy on my joints</Text>
                  <Text style={s.label}>No running or jumping, nothing that needs getting down onto the floor.</Text>
                </View>
                <Switch value={A.joint} onValueChange={(v) => set('joint', v)} trackColor={{ true: c.cat.move.fill }} />
              </Pressable>
            </Q>
          )}

          {step === 4 && (
            <Q eyebrow="Life" title="The rest of the day">
              <Label>Steps on a normal day now</Label>
              <Chips options={STEP_CHOICES.map(([v, l]) => [String(v), l])} value={String(A.steps)} onChange={(v) => set('steps', +v)} />
              <Field label="What you usually eat" value={A.cuisine} onChange={(v) => set('cuisine', v.slice(0, 40))} placeholder="Indian, Mediterranean, mixed" />
              <Label>Habits to start (pick up to three)</Label>
              <Chips multi options={HABIT_OPTS.map((x) => [x.name, habitOptLabel(x)])} values={A.habits}
                onToggle={(v) => setA((o) => ({ ...o, habits: o.habits.includes(v) ? o.habits.filter((x) => x !== v) : o.habits.length < 3 ? [...o.habits, v] : o.habits }))} />
            </Q>
          )}

          {step === 5 && t && (
            <Q eyebrow="Your plan" title={`${A.name.trim() ? A.name.trim() + ', here' : 'Here'} is where you start`}>
              <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between' }]}>
                {[['Calories', n(t.kcal)], ['Protein', `${t.protein} g`], ['Steps', n(t.steps)]].map(([k, v]) => (
                  <View key={k} style={{ gap: 2 }}>
                    <Text style={s.label}>{k}</Text>
                    <Text style={s.stat}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ gap: 10 }}>
                <Bullet>{A.days} training days a week, {(EQUIP.find((e) => e[0] === A.equip)?.[1] ?? '').toLowerCase()}, in four phases over {A.weeks} weeks.</Bullet>
                <Bullet>Estimated maintenance about {n(t.tdee)} kcal. Calories never go below {n(t.floor)}.</Bullet>
                <Bullet>Every number can be changed under Me, and Claude can rework the plan whenever you ask.</Bullet>
              </View>
              <Text style={s.label}>These are estimates from standard formulas, not medical advice. If you have a medical condition, check the targets with your doctor.</Text>
              {isAgain && <Text style={[s.body2, { color: c.warn }]}>Starting again closes your current goal and returns the plan to the default for these answers.</Text>}
            </Q>
          )}
        </ScrollView>

        <View style={{ padding: 20, paddingTop: 8, gap: 8 }}>
          {msg && <Text style={s.error}>{msg}</Text>}
          <View style={s.row}>
            {step > (isAgain ? 1 : 0) && (
              <Pressable style={[s.outline, { borderRadius: 999, minHeight: 56, paddingHorizontal: 24 }]} onPress={() => setStep(step - 1)} disabled={busy}>
                <Text style={s.outlineText}>Back</Text>
              </Pressable>
            )}
            <Pressable style={[s.primary, { flex: 1, minHeight: 56 }, busy && { opacity: 0.5 }]} disabled={busy} onPress={step === N ? finish : next}>
              <Text style={[s.primaryText, { fontSize: 18 }]}>{step === 0 ? 'Get started' : step === N ? (busy ? 'Setting up…' : 'Start') : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Q({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  const { c, s } = useTheme('move');
  return (
    <View style={{ gap: 14 }}>
      <Text style={[s.body2, { fontSize: 17 }]}>{eyebrow}</Text>
      <Text style={{ fontFamily: font.bold, fontSize: 34, lineHeight: 39, color: c.ink }} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  const { s } = useTheme('move');
  return <Text style={[s.label, { fontFamily: font.semibold, fontSize: 14, marginTop: 6 }]}>{children}</Text>;
}
function Bullet({ children }: { children: React.ReactNode }) {
  const { c, s } = useTheme('move');
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.cat.move.fill, marginTop: 8 }} />
      <Text style={[s.body, { flex: 1, lineHeight: 22 }]}>{children}</Text>
    </View>
  );
}
function Field({ label, value, onChange, numeric, placeholder }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; placeholder?: string }) {
  const { c, s } = useTheme('move');
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[s.label, { fontFamily: font.semibold, fontSize: 14 }]}>{label}</Text>
      <TextInput style={[s.input, { minHeight: 56, fontSize: 18 }]} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted}
        keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize={numeric ? 'none' : 'words'} accessibilityLabel={label} />
    </View>
  );
}

type ChipProps = { options: (readonly [string, string, string?])[]; compact?: boolean } & (
  | { multi?: false; value: string; onChange: (v: string) => void }
  | { multi: true; values: string[]; onToggle: (v: string) => void }
);
function Chips(p: ChipProps) {
  const { c } = useTheme('move');
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {p.options.map(([v, label, sub]) => {
        const on = p.multi ? p.values.includes(v) : p.value === v;
        return (
          <Pressable key={v} onPress={() => (p.multi ? p.onToggle(v) : p.onChange(v))} accessibilityRole={p.multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }}
            style={{ width: p.compact ? undefined : '47%', flexGrow: 1, minHeight: 60, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, justifyContent: 'center',
              borderWidth: on ? 1.5 : 1, borderColor: on ? c.cat.move.ink : c.line, backgroundColor: on ? c.cat.move.soft : c.surface }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 17, color: c.ink, textAlign: p.compact ? 'center' : 'left' }}>{label}</Text>
            {sub ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: c.ink2, marginTop: 2 }}>{sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
