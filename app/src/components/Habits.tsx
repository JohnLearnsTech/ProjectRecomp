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
import { font, useTheme } from '../lib/theme';

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

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[s.cardTitle, { flex: 1 }]}>Habits</Text>
        <IconBtn label="Focus timer" glyph="◷" on={showPomo || pomo.phase !== 'idle'} onPress={() => setShowPomo(!showPomo)} />
        <IconBtn label="Add a habit" glyph="+" onPress={() => setAdding(true)} />
      </View>
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
        const ringCol = h.type === 'build' ? c.cat.habit.fill : ratio > 1 ? c.danger : ratio >= 0.75 ? c.warn : c.cat.habit.fill;
        const streak = D.habitStreak(h), longest = D.habitLongest(h), steps = entries[day]?.steps ?? null;
        const ms = timerMs(h.id, now);
        const left = h.goal * unitMs(h.unit) - (valOn(t?.day ?? day, h.id) ?? 0) * unitMs(h.unit) - ms;
        const down = clockMode[h.id] === 'down';
        const bits: string[] = [];
        if (streak > 0) bits.push(`🔥 ${streak}${longest > streak ? ' · best ' + longest : ''}`);
        if (t) bits.push((t.running ? (t.day !== day ? 'Timing' : 'Timing now') : 'On a break') + (t.day !== day ? ` · for ${shortDate(d(t.day))}` : ''));
        else if (h.type === 'limit') bits.push(h.goal > 0 && v0 > h.goal ? `over by ${fu(v0 - h.goal)}` : `${fu(Math.max(0, h.goal - v0))} left`);
        else {
          if (tracksSteps(h) && steps) bits.push(`${steps.toLocaleString('en-IN')} steps`);
          if (cur != null && v0 >= h.goal) bits.push('done');
          else if (!(tracksSteps(h) && steps)) bits.push(`${fu(Math.max(0, h.goal - v0))} to go`);
        }
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
              <HRing ratio={ratio} color={ringCol} track={c.line} inner={timed ? '▶' : `${Math.round(Math.min(ratio, 9.99) * 100)}%`} ink={c.ink} />
            </Pressable>
            <Pressable style={{ flex: 1, gap: 4 }} onPress={() => setSheet(h.id)} accessibilityLabel={`${h.name}: log or edit`}>
              <Text style={[s.row16, { fontFamily: font.semibold }]} numberOfLines={1}>
                {keystone?.id === h.id ? <Text style={{ color: c.warn }}>★ </Text> : null}{h.name}
              </Text>
              <Dots h={h} valOn={valOn} todayI={D.todayI} START={D.series()[0]?.k} />
              <Text style={s.label} numberOfLines={1}>{bits.join(' · ')}</Text>
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
                <Text style={[s.stat, s.num]}>{fq(v0)}</Text>
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
          valOn={valOn} steps={entries[day]?.steps ?? null} strength={D.habitStrength(sheetHabit)} longest={D.habitLongest(sheetHabit)} pct={D.habitPct(sheetHabit)}
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
      <Text style={{ fontFamily: font.bold, fontSize: inner.length > 3 ? 11 : 14, color: ink }}>{inner}</Text>
    </View>
  );
}

/** 7-day squares: filled = met, amber = logged but short, hollow = not logged. */
function Dots({ h, valOn, todayI, START }: { h: HabitDef; valOn: (k: string, id: string) => number | null; todayI: number; START?: string }) {
  const { c } = useTheme('habit');
  if (!START) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityElementsHidden>
      {Array.from({ length: 7 }, (_, j) => {
        const i = todayI - 6 + j;
        if (i < 0) return <View key={j} style={{ width: 11, height: 11 }} />;
        const v = valOn(key(addDays(d(START), i)), h.id);
        const bg = v == null ? 'transparent' : habitMet(h, v) ? c.cat.habit.fill : c.warn;
        return <View key={j} style={{ width: 11, height: 11, borderRadius: 3, borderWidth: 1.5, borderColor: v == null ? c.line : bg, backgroundColor: bg }} />;
      })}
    </View>
  );
}

function HabitSheet(p: {
  h: HabitDef; day: string; future: boolean; isKey: boolean; index: number; count: number; steps: number | null;
  strength: number; longest: number; pct: number | null; todayI: number; START?: string;
  valOn: (k: string, id: string) => number | null; onClose: () => void; onSetValue: (v: number | null) => void; onSteps: (v: number | null) => void;
  onReset: () => void; onChanged: () => void; onGoal: (g: number) => void; onKey: () => void; onMove: (dir: 1 | -1) => void; onDelete: () => void;
}) {
  const { h, day } = p;
  const { c, s } = useTheme('habit');
  const timed = isTimeUnit(h.unit), isHr = timed && unitMs(h.unit) === 3600000;
  const vstep = isHr ? 1 / 12 : h.step;           // hour habits log in 5-minute notches
  const cur = p.valOn(day, h.id);
  const [v, setV] = useState(cur ?? 0);
  const [stepsTxt, setStepsTxt] = useState(p.steps != null ? String(p.steps) : '');
  const [sessions, setSessions] = useState<db.HabitSession[]>([]);
  useEffect(() => setV(cur ?? 0), [cur]);
  useEffect(() => { if (timed) db.listHabitSessions(day).then((r) => setSessions(r.filter((x) => x.habit_id === h.id))).catch(() => {}); }, [timed, day, h.id, cur]);
  const fq = (x: number) => (isHr ? fmtHours(x) : trimNum(x));
  const sState = p.strength >= 70 ? c.cat.habit.fill : p.strength >= 40 ? c.warn : c.danger;
  const setTo = (x: number) => { const n = Math.max(0, +(Math.round(x / vstep) * vstep).toFixed(4)); setV(n); p.onSetValue(n); };
  const timedMs = sessions.reduce((a, g) => a + (new Date(g.ended_at).getTime() - new Date(g.started_at).getTime()), 0);
  const byHand = (cur ?? 0) * unitMs(h.unit) - timedMs;
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const bars = useMemo(() => Array.from({ length: 14 }, (_, j) => {
    const i = p.todayI - 13 + j;
    if (i < 0 || !p.START) return null;
    const k = key(addDays(d(p.START), i)), val = p.valOn(k, h.id);
    return { k, val };
  }), [p.todayI, p.START, p.valOn, h.id]);

  return (
    <Modal transparent animationType="slide" onRequestClose={p.onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}>
        <Pressable style={{ flex: 1 }} onPress={p.onClose} accessibilityLabel="Close" />
        <ScrollView style={{ maxHeight: '88%', backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.cardTitle, { flex: 1 }]}>{h.name}</Text>
            <Pressable onPress={p.onClose} accessibilityLabel="Close" hitSlop={10}><Text style={{ fontSize: 20, color: c.ink2 }}>✕</Text></Pressable>
          </View>
          <Text style={s.label}>{day === new Date().toLocaleDateString('en-CA') ? 'Today' : shortDate(d(day))} · {h.type === 'limit' ? `stay at or under ${fq(h.goal)} ${h.unit}` : `goal ${fq(h.goal)} ${h.unit}`}</Text>
          {p.future ? <Text style={s.body2}>This day hasn't happened yet.</Text> : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Big glyph="−" label="Less" onPress={() => setTo(v - vstep)} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontFamily: font.bold, fontSize: 40, color: c.ink, fontVariant: ['tabular-nums'] }}>{fq(v)}</Text>
                  <Text style={s.label}>{isHr ? 'hours' : h.unit}</Text>
                </View>
                <Big glyph="+" label="More" onPress={() => setTo(v + vstep)} />
              </View>
              <View style={[s.row, { flexWrap: 'wrap' }]}>
                {[h.goal, h.goal / 2, h.goal * 1.5].filter((x, i, a) => x > 0 && a.indexOf(x) === i).map((x) => (
                  <Chip key={x} label={`${fq(+x.toFixed(4))}${isHr ? ' h' : ''}`} onPress={() => setTo(x)} />
                ))}
              </View>
              {tracksSteps(h) && (
                <View style={{ gap: 6 }}>
                  <Text style={s.label}>Steps that day</Text>
                  <View style={s.row}>
                    <TextInput style={[s.input, { flex: 1 }]} keyboardType="number-pad" value={stepsTxt} onChangeText={setStepsTxt} placeholder="0" placeholderTextColor={c.muted}
                      onBlur={() => { const n = stepsTxt.trim() === '' ? null : Math.round(+stepsTxt); if (n == null || (n >= 0 && n <= 200000)) p.onSteps(n); }} accessibilityLabel="Steps" />
                  </View>
                </View>
              )}
              <Pressable style={[s.outline, { alignSelf: 'flex-start' }]} onPress={() => { setV(0); p.onReset(); }}><Text style={s.outlineText}>↺ Reset to zero</Text></Pressable>
            </>
          )}
          {timed && (sessions.length > 0 || byHand >= 60000) && (
            <View style={{ gap: 6 }}>
              <Text style={[s.label, { fontFamily: font.semibold }]}>Sessions</Text>
              {sessions.map((g) => (
                <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[s.body, { flex: 1 }]}>{clock(g.started_at)} – {clock(g.ended_at)}{g.source === 'pomodoro' ? ' · focus' : ''}</Text>
                  <Text style={[s.body, s.num]}>{fmtHours((new Date(g.ended_at).getTime() - new Date(g.started_at).getTime()) / 3600000)}</Text>
                  <Pressable hitSlop={8} accessibilityLabel="Delete this session" onPress={() => deleteSession(h, g, cur).then(p.onChanged)}>
                    <Text style={{ color: c.danger }}>Delete</Text>
                  </Pressable>
                </View>
              ))}
              {byHand >= 60000 && <Text style={s.label}>Entered by hand +{fmtHours(byHand / 3600000)}</Text>}
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60 }} accessibilityLabel="Last 14 days">
            {bars.map((b, j) => {
              if (!b) return <View key={j} style={{ flex: 1 }} />;
              if (b.val == null) return <View key={j} style={{ flex: 1, height: 6, borderRadius: 2, backgroundColor: c.lineSoft }} />;
              const frac = h.goal > 0 ? b.val / h.goal : b.val > 0 ? 1 : 0;
              return <View key={j} style={{ flex: 1, height: `${Math.max(8, Math.min(100, Math.round(frac * 100)))}%`, borderRadius: 3,
                backgroundColor: habitMet(h, b.val) ? c.cat.habit.fill : h.type === 'build' ? c.warn : c.danger, borderWidth: b.k === day ? 1.5 : 0, borderColor: c.ink }} />;
            })}
          </View>
          <Text style={s.label}><Text style={{ color: sState }}>● </Text>Strength {p.strength}{p.longest ? ` · best ${p.longest}` : ''}{p.pct != null ? ` · ${p.pct}% of days` : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={s.label}>Goal</Text>
            <Big small glyph="−" label="Lower goal" onPress={() => p.onGoal(Math.max(0, +(h.goal - h.step).toFixed(4)))} />
            <Text style={[s.body, { fontFamily: font.semibold, minWidth: 40, textAlign: 'center' }]}>{fq(h.goal)}</Text>
            <Big small glyph="+" label="Raise goal" onPress={() => p.onGoal(+(h.goal + h.step).toFixed(4))} />
            <Text style={s.label}>{h.unit}{h.type === 'limit' ? ' max' : ''}</Text>
          </View>
          <View style={s.row}>
            <Pressable style={[s.outline, { flex: 1 }]} onPress={p.onKey}><Text style={s.outlineText}>{p.isKey ? '★ Keystone' : '☆ Make keystone'}</Text></Pressable>
            <Pressable style={[s.outline, p.index <= 0 && { opacity: 0.35 }]} disabled={p.index <= 0} onPress={() => p.onMove(-1)} accessibilityLabel="Move up"><Text style={s.outlineText}>↑</Text></Pressable>
            <Pressable style={[s.outline, p.index >= p.count - 1 && { opacity: 0.35 }]} disabled={p.index >= p.count - 1} onPress={() => p.onMove(1)} accessibilityLabel="Move down"><Text style={s.outlineText}>↓</Text></Pressable>
            <Pressable style={s.outline} onPress={p.onDelete} accessibilityLabel="Remove habit"><Text style={[s.outlineText, { color: c.danger }]}>Remove</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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

function IconBtn({ label, glyph, onPress, on }: { label: string; glyph: string; onPress: () => void; on?: boolean }) {
  const { c } = useTheme('habit');
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.cat.habit.soft : 'transparent' }}>
      <Text style={{ fontSize: 20, color: c.ink, fontFamily: font.medium }}>{glyph}</Text>
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
