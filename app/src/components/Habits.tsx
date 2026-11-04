import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { addDays, d, key, shortDate, trimNum } from '../domain/dates';
import { fmtHours, habitMet, HABIT_UNITS, isTimeUnit, normUnit, tracksSteps, unitMs, type HabitDef } from '../domain/days';
import { fmtDur } from '../domain/training';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import {
  cancelTimer, pauseTimer, pomoBlocksToday, pomoPause, pomoRemain, pomoReset, pomoSettings, pomoStart, pomoStop, pomoTick, startTimer,
  timerMs, toggleClockMode, useNow, useTimerStore,
} from '../lib/habitTimers';
import { deleteSession, logFocus, pomoTarget, resetDay, setValue, stopAndLog } from '../lib/habits';
import { useRecomp } from '../lib/recomp';
import { font, useTheme, type Cat } from '../lib/theme';
import { Icon } from './Icon';
import { range, Wheel } from './Wheel';
import { useInfo } from './ui';

/** r19's Habits section on Today: cards, the running timer, Pomodoro, the log sheet. */
export function Habits({ openId, onOpened }: { openId?: string | null; onOpened?: () => void }) {
  const { day, maxDay, touch } = useRecomp();
  const { D, entries, habits, habitRows, keystone } = useDays();
  const { c, s } = useTheme('habit');
  const { timers, pomo, clockMode } = useTimerStore();
  const running = Object.keys(timers).find((id) => timers[id]?.running && habits.some((h) => h.id === id)) ?? null;
  const now = useNow(!!running || Object.keys(timers).length > 0 || pomo.running);
  const [sheet, setSheet] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showPomo, setShowPomo] = useState(false);
  const [walkAsk, setWalkAsk] = useState<{ h: HabitDef; day: string; ms: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const future = day > maxDay;
  useEffect(() => { if (openId) { setSheet(openId); onOpened?.(); } }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const valOn = (k: string, id: string) => D.habitVal(k, id);
  const run = (p: Promise<unknown>) => p.then(touch).catch((e) => setErr((e as Error).message));

  // Pomodoro: log each finished focus block.
  useEffect(() => {
    if (!pomo.running) return;
    const min = pomoTick();
    if (min > 0) {
      Vibration.vibrate([0, 200, 100, 200]);
      const t = pomoTarget(habits, pomo.targetId);
      if (t) run(logFocus(t, min, (k) => valOn(k, t.id)));
    }
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = async (h: HabitDef) => {
    try {
      const r = await stopAndLog(h, (k) => valOn(k, h.id));
      touch();
      if (r && tracksSteps(h)) setWalkAsk({ h, day: r.day, ms: r.ms });
    } catch (e) { setErr((e as Error).message); }
  };

  const ordered = running ? [habits.find((h) => h.id === running)!, ...habits.filter((h) => h.id !== running)] : habits;
  const sheetHabit = habits.find((h) => h.id === sheet) ?? null;
  const target = pomoTarget(habits, pomo.targetId);
  // r19 tintHabits(): on the cards, in the Multi palette, Walk wears the move colour, limits the body colour, the rest the habit colour.
  const tint = (h: HabitDef): Cat => (c.multi ? c.cat[tracksSteps(h) ? 'move' : h.type === 'limit' ? 'body' : 'habit'] : c.cat.habit);
  const info = useInfo('Build habits are ones you want to hit; limit habits are ones you want to stay under. Each keeps a streak, a strength score and the last two weeks under Details.', 'About this section');

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={s.cardTitle}>Habits</Text>{info.button}</View>
        <IconBtn label="Focus intervals (Pomodoro)" icon="pomo" on={showPomo || pomo.phase !== 'idle'} onPress={() => setShowPomo(!showPomo)} />
        <IconBtn label="Add habit" icon="plus" onPress={() => setAdding(true)} />
      </View>
      {info.panel}
      {err && <Text style={s.error}>{err}</Text>}

      {(showPomo || pomo.phase !== 'idle') && (
        <View style={{ backgroundColor: c.surface2, borderRadius: 16, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[s.label, { fontFamily: font.semibold }]}>Focus · Pomodoro</Text>
            {pomoBlocksToday() > 0 && <Text style={s.label}>{pomoBlocksToday()} block{pomoBlocksToday() > 1 ? 's' : ''} today</Text>}
          </View>
          <Text style={{ fontFamily: font.bold, fontSize: 44, color: pomo.phase === 'break' ? c.cat.move.ink : c.ink, fontVariant: ['tabular-nums'] }}>{fmtDur(pomoRemain(now))}</Text>
          <Text style={s.label}>{pomo.phase === 'break' ? 'Break' : pomo.phase === 'work' ? 'Focus' : 'Focus timer'} · {pomo.running ? (pomo.phase === 'break' ? 'break running' : 'focus running') : pomo.phase === 'idle' ? 'ready' : 'paused'}{target ? ` · logs to ${target.name}` : ''}</Text>
          <View style={s.row}>
            {pomo.phase === 'idle' ? (
              <Pressable style={[s.primary, { flex: 1 }]} onPress={pomoStart}><Text style={s.primaryText}>▶  Start focus</Text></Pressable>
            ) : (
              <>
                <Pressable style={[s.outline, { flex: 1 }]} onPress={pomo.running ? pomoPause : pomoStart}><Text style={s.outlineText}>{pomo.running ? 'Pause' : 'Resume'}</Text></Pressable>
                <Pressable style={[s.outline, { flex: 1 }]} onPress={() => { const m = pomoStop(); if (m && target) run(logFocus(target, m, (k) => valOn(k, target.id))); }}>
                  <Text style={s.outlineText}>Stop & log</Text>
                </Pressable>
                <Pressable style={s.outline} onPress={pomoReset} accessibilityLabel="Reset without logging"><Text style={s.outlineText}>↺</Text></Pressable>
              </>
            )}
          </View>
          {pomo.phase === 'idle' && (
            <View style={{ gap: 8 }}>
              <View style={s.row}>
                <NumField label="Focus (min)" value={pomo.workMin} onChange={(v) => pomoSettings({ workMin: v })} />
                <NumField label="Break (min)" value={pomo.breakMin} onChange={(v) => pomoSettings({ breakMin: v })} />
              </View>
              {habits.some((h) => h.type === 'build' && isTimeUnit(h.unit)) ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Text style={[s.label, { width: '100%' }]}>Logs to</Text>
                  {habits.filter((h) => h.type === 'build' && isTimeUnit(h.unit)).map((h) => (
                    <Chip key={h.id} label={h.name} on={target?.id === h.id} onPress={() => pomoSettings({ targetId: h.id })} />
                  ))}
                </View>
              ) : (
                <Pressable style={s.outline} onPress={() => run(db.addHabit({ name: 'Deep work', type: 'build', unit: 'min', goal: 60, step: 15 }))}>
                  <Text style={s.outlineText}>Add a focus habit</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {!habits.length && <Text style={s.body2}>No habits yet. Add one to start.</Text>}
      {ordered.map((h) => {
        const cur = valOn(day, h.id), v0 = cur ?? 0, t = timers[h.id], timed = isTimeUnit(h.unit);
        const isHr = timed && unitMs(h.unit) === 3600000, fq = (x: number) => (isHr ? fmtHours(x) : trimNum(x));
        const fu = (x: number) => (isHr ? fmtHours(x) : `${trimNum(x)} ${h.unit}`);
        const ratio = h.goal > 0 ? v0 / h.goal : v0 > 0 ? 1 : 0;
        const tc = tint(h);
        const ringCol = h.type === 'build' ? tc.fill : ratio > 1 ? c.danger : ratio >= 0.75 ? c.warn : tc.fill;
        const ms = timerMs(h.id, now);
        const left = h.goal * unitMs(h.unit) - (valOn(t?.day ?? day, h.id) ?? 0) * unitMs(h.unit) - ms;
        const down = clockMode[h.id] === 'down';
        if (h.id === running && t) {
          return (
            <View key={h.id} style={{ backgroundColor: c.cat.habit.soft, borderRadius: 18, padding: 16, gap: 8 }}>
              <Text style={[s.label, { color: c.cat.habit.ink, fontFamily: font.semibold }]}>● Running · {h.name}</Text>
              <Pressable onPress={() => toggleClockMode(h.id)} accessibilityLabel="Switch between session time and time left">
                <Text style={{ fontFamily: font.bold, fontSize: 52, color: c.ink, fontVariant: ['tabular-nums'] }}>{down ? fmtDur(Math.abs(left)) : fmtDur(ms)}</Text>
                <Text style={s.label}>{down ? (left >= 0 ? (h.type === 'limit' ? 'left under cap' : 'left to goal') : (h.type === 'limit' ? 'over the cap' : 'past the goal')) : 'this session'} · {fq(v0)}{isHr ? ' h' : ' ' + h.unit} logged · goal {trimNum(h.goal)}{isHr ? ' h' : ' ' + h.unit} · tap to switch</Text>
              </Pressable>
              <View style={s.row}>
                <Pressable style={[s.outline, { flex: 1 }]} onPress={() => pauseTimer(h.id)}><Text style={s.outlineText}>Pause</Text></Pressable>
                <Pressable style={[s.primary, { flex: 1, backgroundColor: c.cat.habit.fill }]} onPress={() => stop(h)}><Text style={[s.primaryText, { color: c.cat.habit.on }]}>Stop & log</Text></Pressable>
              </View>
            </View>
          );
        }
        return (
          <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 12 }}>
            <Pressable disabled={future && timed} accessibilityLabel={t ? 'Resume timer' : timed ? `Start ${h.name} timer` : `Open ${h.name}`}
              onPress={() => (timed ? startTimer(h.id, day) : setSheet(h.id))}>
              <HRing ratio={ratio} color={ringCol} track={c.line} inner={timed ? (t ? 'pause' : 'play') : `${Math.round(Math.min(ratio, 9.99) * 100)}%`} ink={c.ink} />
            </Pressable>
            <Pressable style={{ flex: 1, gap: 4 }} onPress={() => setSheet(h.id)} accessibilityLabel={`${h.name}: log or edit`}>
              <Text style={{ fontFamily: font.bold, fontSize: 19, color: c.ink }} numberOfLines={1}>
                {keystone?.id === h.id ? <Text style={{ color: c.gold }}>★ </Text> : null}{h.name}
              </Text>
              <Dots h={h} valOn={valOn} todayI={D.todayI} START={D.series()[0]?.k} tint={tc} />
            </Pressable>
            {t ? (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.stat, s.num]}>{fmtDur(ms)}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable onPress={() => startTimer(h.id, t.day)} style={[s.outline, { minHeight: 36 }]}><Text style={s.outlineText}>Resume</Text></Pressable>
                  <Pressable onPress={() => stop(h)} style={[s.outline, { minHeight: 36 }]}><Text style={s.outlineText}>Stop</Text></Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setSheet(h.id)} style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontFamily: font.bold, fontSize: 26, color: c.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{fq(v0)}</Text>
                <Text style={s.label}>of {trimNum(h.goal)} {h.unit}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {sheetHabit && (
        <HabitSheet h={sheetHabit} day={day} future={future} onClose={() => setSheet(null)} isKey={keystone?.id === sheetHabit.id}
          index={habits.findIndex((x) => x.id === sheetHabit.id)} count={habits.length}
          onSetValue={(v) => run(setValue(sheetHabit, day, v))}
          onSteps={(v) => run(db.saveDayFields(day, { steps: v }))}
          onReset={() => { if (timers[sheetHabit.id]?.day === day) cancelTimer(sheetHabit.id); run(resetDay(sheetHabit, day)); }}
          onChanged={touch}
          onGoal={(g) => run(db.updateHabit(sheetHabit.id, { goal: g }))}
          onKey={() => run(db.setKeystone(keystone?.id === sheetHabit.id ? null : sheetHabit.id))}
          onMove={(dir) => {
            const i = habits.findIndex((x) => x.id === sheetHabit.id), j = i + dir, a = habitRows[i], b = habitRows[j];
            if (!a || !b) return;
            run(Promise.all([db.updateHabit(a.id, { sort: b.sort }), db.updateHabit(b.id, { sort: a.sort === b.sort ? b.sort + dir : a.sort })]));
          }}
          onDelete={() => Alert.alert(`Remove ${sheetHabit.name}?`, 'Its history is kept, so past days still show it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => { setSheet(null); cancelTimer(sheetHabit.id); run(db.updateHabit(sheetHabit.id, { archived_at: new Date().toISOString() })); } },
          ])}
          tint={c.cat.move} valOn={valOn} steps={entries[day]?.steps ?? null} strength={D.habitStrength(sheetHabit)} longest={D.habitLongest(sheetHabit)} pct={D.habitPct(sheetHabit)}
          todayI={D.todayI} START={D.series()[0]?.k} />
      )}
      {adding && <AddHabit onClose={() => setAdding(false)} onAdd={(h) => { setAdding(false); run(db.addHabit(h)); }} />}
      {walkAsk && (
        <WalkSteps ask={walkAsk} current={entries[walkAsk.day]?.steps ?? 0} onClose={() => setWalkAsk(null)}
          onAdd={(n) => { const a = walkAsk; setWalkAsk(null); run(db.saveDayFields(a.day, { steps: (entries[a.day]?.steps ?? 0) + n })); }} />
      )}
    </View>
  );
}

function HRing({ ratio, color, track, inner, ink }: { ratio: number; color: string; track: string; inner: string; ink: string }) {
  const C = 2 * Math.PI * 24;
  return (
    <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={56} height={56} viewBox="0 0 56 56" style={{ position: 'absolute' }}>
        <Circle cx={28} cy={28} r={24} stroke={track} strokeWidth={5} fill="none" />
        <Circle cx={28} cy={28} r={24} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`}
          strokeDashoffset={C * (1 - Math.min(1, ratio))} transform="rotate(-90 28 28)" />
      </Svg>
      {inner === 'play' || inner === 'pause' ? <Icon name={inner} size={18} color={ink} /> : <Text style={{ fontFamily: font.bold, fontSize: inner.length > 3 ? 11 : 14, color: ink }}>{inner}</Text>}
    </View>
  );
}

/** 7-day squares: filled = met, amber = logged but short, hollow = not logged. */
function Dots({ h, valOn, todayI, START, tint }: { h: HabitDef; valOn: (k: string, id: string) => number | null; todayI: number; START?: string; tint: Cat }) {
  const { c } = useTheme('habit');
  if (!START) return null;
  // r19 .hdots: filled = goal met, amber = logged but short, hollow = not logged; today outlined.
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 5, alignItems: 'center' }} accessibilityElementsHidden>
      {Array.from({ length: 7 }, (_, j) => {
        const i = todayI - 6 + j;
        if (i < 0) return <View key={j} style={{ width: 9, height: 9, borderRadius: 3, borderWidth: 1, borderColor: c.lineSoft }} />;
        const v = valOn(key(addDays(d(START), i)), h.id);
        const met = v != null && habitMet(h, v);
        const dot = <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: v == null ? 'transparent' : met ? tint.fill : c.warn, borderWidth: v == null ? 1 : met ? 1.5 : 0, borderColor: v == null ? c.lineSoft : tint.ink }} />;
        return i === todayI ? <View key={j} style={{ padding: 1.5, borderRadius: 4, borderWidth: 1.5, borderColor: c.ink2 }}>{dot}</View> : <View key={j}>{dot}</View>;
      })}
    </View>
  );
}

function HabitSheet(p: {
  h: HabitDef; day: string; future: boolean; isKey: boolean; index: number; count: number; steps: number | null; tint: Cat;
  strength: number; longest: number; pct: number | null; todayI: number; START?: string;
  valOn: (k: string, id: string) => number | null; onClose: () => void; onSetValue: (v: number | null) => void; onSteps: (v: number | null) => void;
  onReset: () => void; onChanged: () => void; onGoal: (g: number) => void; onKey: () => void; onMove: (dir: 1 | -1) => void; onDelete: () => void;
}) {
  const { h, day, tint } = p;
  const { c, s } = useTheme('habit');
  const timed = isTimeUnit(h.unit), isHr = timed && unitMs(h.unit) === 3600000;
  const vstep = isHr ? 1 / 12 : h.step > 0 ? h.step : 1;
  const cur = p.valOn(day, h.id);
  const [v, setV] = useState(cur ?? 0);
  const [steps, setSteps] = useState(p.steps ?? 0);
  const [sessions, setSessions] = useState<db.HabitSession[]>([]);
  useEffect(() => setV(cur ?? 0), [cur]);
  useEffect(() => setSteps(p.steps ?? 0), [p.steps]);
  useEffect(() => { if (timed) db.listHabitSessions(day).then((r) => setSessions(r.filter((x) => x.habit_id === h.id))).catch(() => {}); }, [timed, day, h.id, cur]);
  const fq = (x: number) => (isHr ? fmtHours(x) : trimNum(x));
  const sState = p.strength >= 70 ? tint.fill : p.strength >= 40 ? c.warn : c.danger;
  const commit = (x: number) => { const n = Math.max(0, +x.toFixed(4)); setV(n); p.onSetValue(n); };
  const timedMs = sessions.reduce((a, g) => a + (new Date(g.ended_at).getTime() - new Date(g.started_at).getTime()), 0);
  const byHand = (cur ?? 0) * unitMs(h.unit) - timedMs;
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const bars = useMemo(() => Array.from({ length: 14 }, (_, j) => {
    const i = p.todayI - 13 + j;
    if (i < 0 || !p.START) return null;
    const k = key(addDays(d(p.START), i));
    return { k, val: p.valOn(k, h.id) };
  }), [p.todayI, p.START, p.valOn, h.id]);
  // r19 wheels: hours and minutes for hour habits, one value wheel otherwise; Walk adds two steps wheels.
  const hh = Math.floor(v), mm = Math.min(59, Math.round((v - hh) * 60));
  const wmax = Math.max(Math.ceil((h.goal * 2) / vstep) * vstep, vstep * 20, Math.ceil(v / vstep) * vstep + vstep * 4);
  const sk = Math.floor(steps / 1000) * 1000, sh = Math.min(950, Math.round((steps - sk) / 50) * 50);
  const setStepsTo = (n: number) => { setSteps(n); p.onSteps(n); };
  const Hic = ({ icon, glyph, label, onPress, disabled, on }: { icon?: string; glyph?: string; label: string; onPress: () => void; disabled?: boolean; on?: boolean }) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: on ? c.gold : c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      {icon ? <Icon name={icon} size={15} color={c.ink2} /> : <Text style={{ fontSize: 16, color: on ? c.gold : c.ink2 }}>{glyph}</Text>}
    </Pressable>
  );
  return (
    <Modal transparent animationType="slide" onRequestClose={p.onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <Pressable style={{ flex: 1 }} onPress={p.onClose} accessibilityLabel="Close" />
        <ScrollView style={{ maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, gap: 12 }}>
          <View style={{ alignItems: 'center' }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontFamily: font.bold, fontSize: 18, color: c.ink }}>{h.name}</Text>
            <Pressable onPress={p.onClose} accessibilityLabel="Close" style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: c.ink2 }}>✕</Text>
            </Pressable>
          </View>
          {p.future ? <Text style={s.body2}>This day hasn't happened yet.</Text> : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 34, color: c.ink, fontVariant: ['tabular-nums'] }}>{fq(v)}</Text>
                <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: c.muted }}>{isHr ? 'hours' : h.unit}</Text>
                {tracksSteps(h) && <>
                  <Text style={{ fontFamily: font.bold, fontSize: 20, color: c.muted }}>·</Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 34, color: c.ink, fontVariant: ['tabular-nums'] }}>{steps.toLocaleString('en-US')}</Text>
                  <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: c.muted }}>steps</Text>
                </>}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 6 }}>
                {isHr ? (
                  <>
                    <Wheel label="hr" values={range(0, 24, 1)} value={hh} format={(x) => String(x)} color={tint.fill} onChange={(x) => commit(x + mm / 60)} />
                    <Text style={{ fontFamily: font.bold, fontSize: 24, color: c.muted, marginTop: 52 }}>:</Text>
                    <Wheel label="min" values={range(0, 59, 1)} value={mm} format={(x) => String(x).padStart(2, '0')} color={tint.fill} onChange={(x) => commit(hh + x / 60)} />
                  </>
                ) : (
                  <Wheel label={h.unit} values={range(0, wmax, vstep)} value={Math.round(v / vstep) * vstep} format={(x) => trimNum(x)} color={tint.fill} onChange={commit} />
                )}
                {tracksSteps(h) && <>
                  <Wheel label="×1000" values={range(0, 30000, 1000)} value={sk} format={(x) => String(Math.round(x / 1000))} color={tint.fill} onChange={(x) => setStepsTo(x + sh)} />
                  <Wheel label="steps" values={range(0, 950, 50)} value={sh} format={(x) => String(Math.round(x)).padStart(3, '0')} color={tint.fill} onChange={(x) => setStepsTo(sk + x)} />
                </>}
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Pressable onPress={() => { setV(0); p.onReset(); }} accessibilityLabel="Reset today to zero"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.line }}>
                  <Icon name="reset" size={15} color={c.ink} /><Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: c.ink }}>Reset to zero</Text>
                </Pressable>
              </View>
            </>
          )}
          {timed && (sessions.length > 0 || byHand >= 60000) && (
            <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 10 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted }}>Sessions</Text>
              {sessions.map((g) => (
                <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                  <Text style={[s.body, { flex: 1 }]}>{clock(g.started_at)} — {clock(g.ended_at)}{g.source === 'pomodoro' ? ' · focus' : ''}</Text>
                  <Text style={[s.body, s.num, { fontFamily: font.bold }]}>{fmtHours((new Date(g.ended_at).getTime() - new Date(g.started_at).getTime()) / 3600000)}</Text>
                  <Pressable hitSlop={8} accessibilityLabel="Delete this session" onPress={() => deleteSession(h, g, cur).then(p.onChanged)}><Icon name="trash" size={16} color={c.muted} /></Pressable>
                </View>
              ))}
              {byHand >= 60000 && <Text style={s.label}>Entered by hand +{fmtHours(byHand / 3600000)}</Text>}
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 46 }} accessibilityLabel="Last 14 days">
            {bars.map((b, j) => {
              if (!b) return <View key={j} style={{ flex: 1 }} />;
              const today = b.k === day;
              const box = { flex: 1, height: '100%' as const, borderTopLeftRadius: 3, borderTopRightRadius: 3, justifyContent: 'flex-end' as const, overflow: 'hidden' as const,
                backgroundColor: b.val == null ? 'transparent' : c.lineSoft, borderWidth: today ? 1.5 : 0, borderColor: c.ink2 };
              if (b.val == null) return <View key={j} style={box}><View style={{ height: 2, borderRadius: 2, backgroundColor: c.line }} /></View>;
              const frac = h.goal > 0 ? b.val / h.goal : b.val > 0 ? 1 : 0;
              return <View key={j} style={box}><View style={{ height: `${Math.max(8, Math.min(100, Math.round(frac * 100)))}%`, backgroundColor: habitMet(h, b.val) ? tint.fill : h.type === 'build' ? c.warn : c.danger }} /></View>;
            })}
          </View>
          <Text style={s.label}><Text style={{ color: sState }}>● </Text>Strength {p.strength}{p.longest ? ` · best ${p.longest}` : ''}{p.pct != null ? ` · ${p.pct}% of days` : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: c.lineSoft, paddingTop: 12 }}>
            <Text style={s.label}>Goal</Text>
            <Hic glyph="−" label="Lower goal" onPress={() => p.onGoal(Math.max(0, +(h.goal - h.step).toFixed(4)))} />
            <Text style={[s.body, { fontFamily: font.bold, minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{fq(h.goal)}</Text>
            <Hic glyph="+" label="Raise goal" onPress={() => p.onGoal(+(h.goal + h.step).toFixed(4))} />
            <Text style={s.label}>{h.unit}{h.type === 'limit' ? ' max' : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
              <Hic glyph={p.isKey ? '★' : '☆'} on={p.isKey} label={p.isKey ? 'Keystone habit' : 'Make this the keystone'} onPress={p.onKey} />
              <Hic icon="up" label="Move up" disabled={p.index <= 0} onPress={() => p.onMove(-1)} />
              <Hic icon="down" label="Move down" disabled={p.index >= p.count - 1} onPress={() => p.onMove(1)} />
              <Hic icon="trash" label="Remove habit" onPress={p.onDelete} />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddHabit({ onClose, onAdd }: { onClose: () => void; onAdd: (h: { name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number }) => void }) {
  const { c, s } = useTheme('habit');
  const [name, setName] = useState('');
  const [type, setType] = useState<'build' | 'limit'>('build');
  const [unit, setUnit] = useState('min');
  const [other, setOther] = useState('');
  const [goal, setGoal] = useState('20');
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    if (!name.trim()) return setErr('Give it a name.');
    let u = unit, step: number;
    if (unit === '__other') { u = normUnit(other.trim().slice(0, 8)); if (!u) return setErr('Name the unit.'); step = u === 'h' ? 0.5 : u === 'min' ? 5 : 1; }
    else step = HABIT_UNITS.find((x) => x.v === unit)!.step;
    onAdd({ name: name.trim().slice(0, 40), type, unit: u, goal: Math.max(0, +goal.replace(',', '.') || 0), step });
  };
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <ScrollView style={{ maxHeight: '85%', backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }} contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Text style={s.cardTitle}>New habit</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Reading, No sugar, Steps" placeholderTextColor={c.muted} maxLength={40} accessibilityLabel="Name" />
          <View style={s.row}>
            <Chip label="Build: hit at least" on={type === 'build'} onPress={() => setType('build')} />
            <Chip label="Limit: stay under" on={type === 'limit'} onPress={() => setType('limit')} />
          </View>
          <Text style={s.label}>Unit</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {HABIT_UNITS.map((u) => <Chip key={u.v} label={u.l} on={unit === u.v} onPress={() => { setUnit(u.v); if (!touched) setGoal(String(u.goal)); }} />)}
            <Chip label="Other…" on={unit === '__other'} onPress={() => setUnit('__other')} />
          </View>
          {unit === '__other' && <TextInput style={s.input} value={other} onChangeText={setOther} placeholder="reps, sets" placeholderTextColor={c.muted} maxLength={8} accessibilityLabel="Your unit" />}
          <Text style={s.label}>{type === 'limit' ? 'Cap' : 'Goal'}</Text>
          <TextInput style={s.input} value={goal} onChangeText={(v) => { setGoal(v); setTouched(true); }} keyboardType="decimal-pad" accessibilityLabel="Goal" />
          {err && <Text style={s.error}>{err}</Text>}
          <Pressable style={s.primary} onPress={add}><Text style={s.primaryText}>Add habit</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function WalkSteps({ ask, current, onClose, onAdd }: { ask: { h: HabitDef; day: string; ms: number }; current: number; onClose: () => void; onAdd: (n: number) => void }) {
  const { c, s } = useTheme('habit');
  const [n, setN] = useState('');
  const v = Math.round(+n) || 0;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' }}>
        <View style={[s.card, { gap: 12 }]}>
          <Text style={s.section}>Steps on this walk</Text>
          <Text style={s.body2}>{ask.h.name}: {fmtDur(ask.ms)} logged. Add the steps from your phone or watch.</Text>
          <TextInput style={s.input} value={n} onChangeText={setN} keyboardType="number-pad" placeholder="2,400" placeholderTextColor={c.muted} autoFocus accessibilityLabel="Steps" />
          <Text style={s.label}>{v > 0 ? `Day total becomes ${(current + v).toLocaleString('en-IN')} steps.` : current ? `So far: ${current.toLocaleString('en-IN')} steps.` : 'No steps logged that day yet.'}</Text>
          <View style={s.row}>
            <Pressable style={[s.primary, { flex: 1 }, !(v > 0) && { opacity: 0.5 }]} disabled={!(v > 0)} onPress={() => onAdd(v)}><Text style={s.primaryText}>Add steps</Text></Pressable>
            <Pressable style={s.outline} onPress={onClose}><Text style={s.outlineText}>Skip</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function IconBtn({ label, icon, onPress, on }: { label: string; icon: string; onPress: () => void; on?: boolean }) {
  const { c } = useTheme('habit');
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.cat.habit.soft : c.surface }}>
      <Icon name={icon} size={17} color={c.ink} />
    </Pressable>
  );
}
function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const { c } = useTheme('habit');
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected: !!on }}
      style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? c.cat.habit.soft : c.surface2, borderWidth: on ? 1.5 : 0, borderColor: c.cat.habit.ink }}>
      <Text style={{ fontFamily: font.medium, color: on ? c.cat.habit.ink : c.ink2 }}>{label}</Text>
    </Pressable>
  );
}
function Big({ glyph, label, onPress, small }: { glyph: string; label: string; onPress: () => void; small?: boolean }) {
  const { c } = useTheme('habit');
  const z = small ? 40 : 56;
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ width: z, height: z, borderRadius: 14, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: small ? 20 : 26, color: c.ink, fontFamily: font.semibold }}>{glyph}</Text>
    </Pressable>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const { s } = useTheme('habit');
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={t} onChangeText={setT} keyboardType="number-pad" onBlur={() => { const n = +t; if (n > 0) onChange(n); else setT(String(value)); }} accessibilityLabel={label} />
    </View>
  );
}
