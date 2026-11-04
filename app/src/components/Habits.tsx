import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, Text, TextInput, Vibration, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { addDays, d, key, shortDate, trimNum } from '../domain/dates';
import { fmtHours, habitMet, HABIT_UNITS, isTimeUnit, normUnit, tracksSteps, unitMs, type HabitDef } from '../domain/days';
import { fmtDur } from '../domain/training';
import * as db from '../lib/db';
import { useDays } from '../lib/days';
import {
  cancelTimer, pauseTimer, pomoBlocksToday, pomoPause, pomoRemain, pomoReset, pomoSettings, pomoStart, pomoStop, pomoTick, startTimer,
  timerMs, toggleClockMode, useNow, useTimerStore,
} from '../lib/habitTimers';
import { deleteSession, logFocus, pomoTarget, resetDay, setValue, setValue as setValueH, stopAndLog } from '../lib/habits';
import { toast } from '../lib/toast';
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
  const [focus, setFocus] = useState<{ id: string } | 'pomo' | null>(null);
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
        // r19 renderPomo: tag and blocks, the clock, status, controls, then a Settings fold.
        <View style={{ backgroundColor: c.cat.move.soft, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1.5, borderColor: c.cat.move.fill }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[s.label, { fontFamily: font.bold, color: c.cat.move.ink, flex: 1 }]}>● Focus · Pomodoro</Text>
            {pomoBlocksToday() > 0 && <Text style={[s.label, { marginRight: 8 }]}>{pomoBlocksToday()} block{pomoBlocksToday() > 1 ? 's' : ''} today</Text>}
            <Pressable onPress={() => setFocus('pomo')} accessibilityLabel="Full-screen focus" hitSlop={8}
              style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="expand" size={16} color={c.ink2} />
            </Pressable>
          </View>
          <View>
            <Text style={{ fontFamily: font.bold, fontSize: 48, color: pomo.phase === 'break' ? c.warn : c.ink, fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{fmtDur(pomoRemain(now))}</Text>
            <Text style={[s.label, { fontSize: 12 }]}>{pomo.phase === 'break' ? 'Break' : pomo.phase === 'work' ? 'Focus' : 'Focus timer'}</Text>
          </View>
          <Text style={s.label}>{[pomo.running ? (pomo.phase === 'break' ? 'break running' : 'focus running') : pomo.phase === 'idle' ? 'ready' : 'paused', target ? 'logs to ' + target.name : null].filter(Boolean).join(' · ')}</Text>
          <View style={s.row}>
            {pomo.phase === 'idle' ? (
              <Pressable style={[s.primary, { flex: 1, backgroundColor: c.cat.move.fill }]} onPress={pomoStart}><Icon name="play" size={14} color={c.cat.move.on} /><Text style={[s.primaryText, { color: c.cat.move.on }]}>Start focus</Text></Pressable>
            ) : (
              <>
                <Pressable style={[s.outline, { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: c.surface }]} onPress={pomo.running ? pomoPause : pomoStart}>
                  <Icon name={pomo.running ? 'pause' : 'play'} size={14} color={c.ink} /><Text style={s.outlineText}>{pomo.running ? 'Pause' : 'Resume'}</Text>
                </Pressable>
                <Pressable style={[s.primary, { flex: 1, backgroundColor: c.cat.move.fill }]} onPress={() => { const m = pomoStop(); if (m && target) run(logFocus(target, m, (k) => valOn(k, target.id))); }}>
                  <Icon name="stop" size={13} color={c.cat.move.on} /><Text style={[s.primaryText, { color: c.cat.move.on }]}>Stop & log</Text>
                </Pressable>
                <Pressable style={[s.outline, { width: 48, paddingHorizontal: 0, backgroundColor: c.surface }]} onPress={pomoReset} accessibilityLabel="Reset without logging"><Icon name="reset" size={16} color={c.ink} /></Pressable>
              </>
            )}
          </View>
          <PomoSettings open={pomo.phase === 'idle'} work={pomo.workMin} brk={pomo.breakMin} builds={habits.filter((h) => h.type === 'build' && isTimeUnit(h.unit))} target={target}
            onWork={(v) => pomoSettings({ workMin: Math.max(1, Math.min(120, v)) })} onBreak={(v) => pomoSettings({ breakMin: Math.max(1, Math.min(60, v)) })}
            onTarget={(id) => pomoSettings({ targetId: id })} onAddFocus={() => run(db.addHabit({ name: 'Deep work', type: 'build', unit: 'min', goal: 60, step: 15 }))} />
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
            <View key={h.id} style={{ backgroundColor: tc.soft, borderRadius: 18, padding: 16, gap: 8, borderWidth: 1.5, borderColor: tc.fill }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[s.label, { flex: 1, color: tc.ink, fontFamily: font.bold }]}>● Running · {h.name}</Text>
                <Pressable onPress={() => setFocus({ id: h.id })} accessibilityLabel="Full-screen focus" hitSlop={8}
                  style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="expand" size={16} color={c.ink2} />
                </Pressable>
              </View>
              <Pressable onPress={() => toggleClockMode(h.id)} accessibilityLabel="Switch between session time and time left">
                <Text style={{ fontFamily: font.bold, fontSize: 52, color: c.ink, fontVariant: ['tabular-nums'] }}>{down ? fmtDur(Math.abs(left)) : fmtDur(ms)}</Text>
                <Text style={s.label}>{down ? (left >= 0 ? (h.type === 'limit' ? 'left under cap' : 'left to goal') : (h.type === 'limit' ? 'over the cap' : 'past the goal')) : 'this session'} · {fq(v0)}{isHr ? ' h' : ' ' + h.unit} logged · goal {trimNum(h.goal)}{isHr ? ' h' : ' ' + h.unit} · tap to switch</Text>
              </Pressable>
              <View style={s.row}>
                <Pressable style={[s.outline, { flex: 1, backgroundColor: c.surface, flexDirection: 'row', gap: 6 }]} onPress={() => pauseTimer(h.id)}><Icon name="pause" size={15} color={c.ink} /><Text style={s.outlineText}>Pause</Text></Pressable>
                <Pressable style={[s.primary, { flex: 1, backgroundColor: tc.fill }]} onPress={() => stop(h)}><Icon name="stop" size={14} color={tc.on} /><Text style={[s.primaryText, { color: tc.on }]}>Stop & log</Text></Pressable>
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

      {adding && <AddHabit onClose={() => setAdding(false)} onAdd={(h) => { setAdding(false); run(db.addHabit(h)); }} />}

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
          onDelete={() => {
            const gone = sheetHabit; setSheet(null); cancelTimer(gone.id);
            run(db.updateHabit(gone.id, { archived_at: new Date().toISOString() }).then(() => toast(`Removed “${gone.name}”`, () => run(db.updateHabit(gone.id, { archived_at: null })))));
          }}
          tint={c.cat.move} valOn={valOn} steps={entries[day]?.steps ?? null} strength={D.habitStrength(sheetHabit)} longest={D.habitLongest(sheetHabit)} pct={D.habitPct(sheetHabit)}
          todayI={D.todayI} START={D.series()[0]?.k} />
      )}
      {focus && (() => {
        if (focus === 'pomo') {
          const isBreak = pomo.phase === 'break', total = (isBreak ? pomo.breakMin : pomo.workMin) * 60000, rem = pomoRemain(now);
          return <FocusView name={isBreak ? 'Break' : 'Focus'} clock={fmtDur(rem)} warn={isBreak}
            mode={pomo.running ? (isBreak ? 'break — step away' : 'stay on task') : pomo.phase === 'idle' ? 'ready when you are' : 'paused'}
            meta={`${target ? 'logs to ' + target.name : 'no habit linked'} · ${pomo.workMin}/${pomo.breakMin} min${pomoBlocksToday() ? ` · ${pomoBlocksToday()} block${pomoBlocksToday() > 1 ? 's' : ''} today` : ''} · screen stays awake`}
            ratio={total > 0 ? Math.min(1, Math.max(0, total - rem) / total) : 0} running={pomo.running} playLabel={pomo.phase === 'idle' ? 'Start' : 'Resume'}
            onPause={() => (pomo.running ? pomoPause() : pomoStart())} onStop={() => { const m = pomoStop(); if (m && target) run(logFocus(target, m, (k) => valOn(k, target.id))); setFocus(null); }}
            onClose={() => setFocus(null)} />;
        }
        const h = habits.find((x) => x.id === focus.id), t = h ? timers[h.id] : null;
        if (!h || !t) return null;
        const ms = timerMs(h.id, now), v0 = valOn(t.day, h.id) ?? 0, um = unitMs(h.unit), down = clockMode[h.id] === 'down';
        const left = h.goal * um - v0 * um - ms, isHr = um === 3600000;
        const r0 = h.goal > 0 ? Math.min(1, (v0 * um + ms) / (h.goal * um)) : 0;
        return <FocusView name={h.name} clock={down ? fmtDur(Math.abs(left)) : fmtDur(ms)}
          mode={(down ? (left >= 0 ? (h.type === 'limit' ? 'left under cap' : 'left to goal') : (h.type === 'limit' ? 'over the cap' : 'past the goal')) : 'this session') + ' · tap to switch'}
          meta={`${isHr ? fmtHours(v0) : Math.round(v0) + ' min'} logged today · goal ${trimNum(h.goal)}${h.unit ? ' ' + h.unit : ''} · screen stays awake`}
          ratio={r0} warn={h.type === 'limit' && r0 >= 1} running={t.running} playLabel="Resume" onSwitch={() => toggleClockMode(h.id)}
          onPause={() => (t.running ? pauseTimer(h.id) : startTimer(h.id, t.day))} onStop={() => { setFocus(null); stop(h); }} onClose={() => setFocus(null)} />;
      })()}
      {walkAsk && (
        <WalkSteps ask={walkAsk} current={entries[walkAsk.day]?.steps ?? 0} onClose={() => setWalkAsk(null)}
          onAdd={(n) => { const a = walkAsk; setWalkAsk(null); run(db.saveDayFields(a.day, { steps: (entries[a.day]?.steps ?? 0) + n })); }} />
      )}
    </View>
  );
}

/** r19 full-screen focus session: a dark screen, one big ring, the clock, Pause and Stop & log. */
function FocusView(p: { name: string; clock: string; mode: string; meta: string; ratio: number; warn?: boolean; running: boolean; playLabel: string;
  onPause: () => void; onStop: () => void; onClose: () => void; onSwitch?: () => void }) {
  // The screen stays awake on the phone; browsers refuse the wake lock outside a user gesture.
  if (Platform.OS !== 'web') useKeepAwake(); // eslint-disable-line react-hooks/rules-of-hooks
  const { c } = useTheme('move');
  const R = 126, CF = 2 * Math.PI * R;
  return (
    <Modal visible animationType="fade" onRequestClose={p.onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#08090a' }}>
        <Svg style={{ position: 'absolute', width: '100%', height: '100%' }}>
          <Defs><RadialGradient id="fg" cx="50%" cy="30%" rx="95%" ry="70%"><Stop offset="0" stopColor="#1a2609" /><Stop offset="0.52" stopColor="#0c0e07" /><Stop offset="1" stopColor="#08090a" /></RadialGradient></Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#fg)" />
        </Svg>
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 28, alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
            <Pressable onPress={p.onClose} accessibilityLabel="Minimize" style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#2a2d30', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="minimize" size={18} color="#AEB4AB" />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontFamily: font.bold, fontSize: 12, color: '#8A9188', letterSpacing: 0.6 }}>FOCUS SESSION</Text>
            <View style={{ width: 40 }} />
          </View>
          <Pressable onPress={p.onSwitch} disabled={!p.onSwitch} accessibilityLabel="Switch between time this session and time left" style={{ width: '100%', maxWidth: 380, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Svg viewBox="0 0 260 260" style={{ position: 'absolute', width: '100%', height: '100%' }}>
              <Circle cx={130} cy={130} r={R} fill="none" stroke="#2a2d30" strokeWidth={6} />
              <Circle cx={130} cy={130} r={R} fill="none" stroke={p.warn ? c.warn : c.cat.move.fill} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${CF} ${CF}`} strokeDashoffset={CF * (1 - p.ratio)} transform="rotate(-90 130 130)" />
            </Svg>
            <Text style={{ fontFamily: font.bold, fontSize: 26, color: '#F3F5F0', textAlign: 'center', paddingHorizontal: 30 }} numberOfLines={2}>{p.name}</Text>
            <Text style={{ fontFamily: font.bold, fontSize: 64, color: p.warn ? c.warn : '#F3F5F0', fontVariant: ['tabular-nums'], letterSpacing: -1 }}>{p.clock}</Text>
            <Text style={{ fontFamily: font.semibold, fontSize: 12, color: '#8A9188' }}>{p.mode}</Text>
          </Pressable>
          <Text style={{ fontFamily: font.regular, fontSize: 13, color: '#8A9188', textAlign: 'center', paddingHorizontal: 24 }}>{p.meta}</Text>
          <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
            <Pressable onPress={p.onPause} style={{ flex: 1, minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: '#2a2d30', backgroundColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name={p.running ? 'pause' : 'play'} size={15} color="#F3F5F0" /><Text style={{ fontFamily: font.bold, fontSize: 16, color: '#F3F5F0' }}>{p.running ? 'Pause' : p.playLabel}</Text>
            </Pressable>
            <Pressable onPress={p.onStop} style={{ flex: 1, minHeight: 54, borderRadius: 14, backgroundColor: c.cat.move.fill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="stop" size={14} color={c.cat.move.on} /><Text style={{ fontFamily: font.bold, fontSize: 16, color: c.cat.move.on }}>Stop & log</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  const wmax = Math.max(Math.ceil((h.goal * 2) / vstep) * vstep, vstep * 20, Math.ceil(v / vstep) * vstep + vstep * 4);
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
              {timed || tracksSteps(h) ? (
                // Time habits and Walk: plain text boxes (owner's choice over r19's wheels).
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {timed && (
                    <TypeBox label={isHr ? 'Time (h:mm)' : `Time (${h.unit})`} value={fq(v)} placeholder={isHr ? '1:30' : '20'}
                      parse={(t) => {
                        const m = t.trim().match(/^(\d{1,2}):(\d{1,2})$/);
                        if (isHr) return m ? +m[1] + Math.min(59, +m[2]) / 60 : t.trim() === '' ? 0 : Number(t.replace(',', '.'));
                        return m ? +m[1] * 60 + +m[2] : t.trim() === '' ? 0 : Number(t.replace(',', '.'));
                      }}
                      ok={(x) => x >= 0 && x <= (isHr ? 24 : 1440)} onCommit={commit} />
                  )}
                  {!timed && (
                    <TypeBox label={h.unit || 'Value'} value={trimNum(v)} placeholder="0" parse={(t) => (t.trim() === '' ? 0 : Number(t.replace(',', '.')))} ok={(x) => x >= 0} onCommit={commit} />
                  )}
                  {tracksSteps(h) && (
                    <TypeBox label="Steps" value={steps ? String(steps) : ''} placeholder="6000" parse={(t) => (t.trim() === '' ? 0 : Math.round(Number(t.replace(/[,\s]/g, ''))))}
                      ok={(x) => x >= 0 && x <= 200000} onCommit={setStepsTo} />
                  )}
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
                    <Text style={{ fontFamily: font.bold, fontSize: 34, color: c.ink, fontVariant: ['tabular-nums'] }}>{fq(v)}</Text>
                    <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: c.muted }}>{h.unit}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                    <Wheel label={h.unit} values={range(0, wmax, vstep)} value={Math.round(v / vstep) * vstep} format={(x) => trimNum(x)} color={tint.fill} onChange={commit} />
                  </View>
                </>
              )}
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
                  <Pressable hitSlop={8} accessibilityLabel="Delete this session" onPress={() => { const before = cur; deleteSession(h, g, cur).then(() => {
                    p.onChanged();
                    toast(`Session removed (${fmtHours((new Date(g.ended_at).getTime() - new Date(g.started_at).getTime()) / 3600000)})`, async () => {
                      await db.addHabitSessions([{ habit_id: g.habit_id, date: g.date, started_at: g.started_at, ended_at: g.ended_at, source: g.source }]);
                      await setValueH(h, g.date, before); p.onChanged();
                    });
                  }); }}><Icon name="trash" size={16} color={c.muted} /></Pressable>
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

/** A labelled number box that saves when you leave it or press done; refuses values out of range. */
function TypeBox({ label, value, placeholder, parse, ok, onCommit }: { label: string; value: string; placeholder: string; parse: (t: string) => number; ok: (x: number) => boolean; onCommit: (x: number) => void }) {
  const { c, s } = useTheme('habit');
  const [t, setT] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => setT(value), [value]);
  const save = () => { const x = parse(t); if (!Number.isFinite(x) || !ok(x)) { setBad(true); return; } setBad(false); onCommit(x); };
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink2 }}>{label}</Text>
      <TextInput style={[s.input, { fontSize: 24, fontFamily: font.bold, minHeight: 56, textAlign: 'center' }, bad && { borderColor: c.danger }]} value={t} onChangeText={(x) => { setT(x); setBad(false); }}
        onBlur={save} onSubmitEditing={save} returnKeyType="done" keyboardType="numbers-and-punctuation" placeholder={placeholder} placeholderTextColor={c.muted} accessibilityLabel={label} selectTextOnFocus />
      {bad && <Text style={s.error}>That doesn't look right.</Text>}
    </View>
  );
}

/** r19 renderHabitForm: an inline form under the list, dashed outline, with dropdowns. */
function Drop<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  const { c, s } = useTheme('habit');
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, minHeight: 44 }]}>
        <Text style={s.body} numberOfLines={1}>{options.find((o) => o[0] === value)?.[1]}</Text><Icon name="down" size={15} color={c.ink2} />
      </Pressable>
      {open && (
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.surface, overflow: 'hidden' }}>
          {options.map(([v, l]) => (
            <Pressable key={v} onPress={() => { onChange(v); setOpen(false); }} style={{ paddingHorizontal: 14, paddingVertical: 11, backgroundColor: v === value ? c.surface2 : c.surface }}>
              <Text style={[s.body, v === value && { fontFamily: font.semibold }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function AddHabit({ onClose, onAdd }: { onClose: () => void; onAdd: (h: { name: string; type: 'build' | 'limit'; unit: string; goal: number; step: number }) => void }) {
  const { c, s } = useTheme('move');
  const [name, setName] = useState('');
  const [type, setType] = useState<'build' | 'limit'>('build');
  const [unit, setUnit] = useState('min');
  const [other, setOther] = useState('');
  const [goal, setGoal] = useState('20');
  const [touched, setTouched] = useState(false);
  const [bad, setBad] = useState(false);
  const add = () => {
    if (!name.trim()) return setBad(true);
    let u = unit, step: number;
    if (unit === '__other') { u = normUnit(other.trim().slice(0, 8)); step = u === 'h' ? 0.5 : u === 'min' ? 5 : 1; }
    else step = HABIT_UNITS.find((x) => x.v === unit)!.step;
    onAdd({ name: name.trim().slice(0, 40), type, unit: u, goal: Math.max(0, +goal.replace(',', '.') || 0), step });
  };
  const L = ({ t }: { t: string }) => <Text style={{ fontFamily: font.regular, fontSize: 13, color: c.ink2 }}>{t}</Text>;
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: 12, padding: 14, gap: 10 }}>
      <View style={{ gap: 5 }}><L t="Name" />
        <TextInput style={[s.input, { backgroundColor: c.surface }, bad && { borderColor: c.danger }]} value={name} onChangeText={(x) => { setName(x); setBad(false); }} maxLength={40}
          placeholder="e.g. Reading, No sugar, Steps" placeholderTextColor={c.muted} accessibilityLabel="Name" autoFocus /></View>
      <View style={{ gap: 5 }}><L t="Type" />
        <Drop label="Type" value={type} onChange={setType} options={[['build', 'Build — hit at least the goal'], ['limit', 'Limit — stay at or under the goal']]} /></View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 5 }}><L t="Goal" />
          <TextInput style={[s.input, { backgroundColor: c.surface, minHeight: 44 }]} value={goal} onChangeText={(v) => { setGoal(v); setTouched(true); }} keyboardType="decimal-pad" accessibilityLabel="Goal" /></View>
        <View style={{ flex: 1.3, gap: 5 }}><L t="Unit" />
          <Drop label="Unit" value={unit} onChange={(v) => { setUnit(v); const u = HABIT_UNITS.find((x) => x.v === v); if (u && !touched) setGoal(String(u.goal)); }}
            options={[...HABIT_UNITS.map((u) => [u.v, u.l] as [string, string]), ['__other', 'Other…']]} /></View>
      </View>
      {unit === '__other' && <View style={{ gap: 5 }}><L t="Your unit" />
        <TextInput style={[s.input, { backgroundColor: c.surface }]} value={other} onChangeText={setOther} placeholder="e.g. reps, sets" placeholderTextColor={c.muted} maxLength={8} accessibilityLabel="Your unit" /></View>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Pressable style={[s.primary, { paddingHorizontal: 20, minHeight: 44 }]} onPress={add}><Text style={s.primaryText}>Add habit</Text></Pressable>
        <Pressable style={[s.outline, { minHeight: 44, borderRadius: 999 }]} onPress={onClose}><Text style={s.outlineText}>Cancel</Text></Pressable>
      </View>
    </View>
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
function MinBox({ label, value, onSet }: { label: string; value: number; onSet: (v: number) => void }) {
  const { c, s } = useTheme('move');
    const [t, setT] = useState(String(value));
    useEffect(() => setT(String(value)), [value]);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={s.body}>{label}</Text>
        <TextInput style={[s.input, { width: 56, minHeight: 38, paddingHorizontal: 8, textAlign: 'center', backgroundColor: c.surface }]} value={t} onChangeText={setT} keyboardType="number-pad"
          onBlur={() => { const n = Math.round(+t); if (n > 0) onSet(n); else setT(String(value)); }} accessibilityLabel={label + ' minutes'} />
        <Text style={s.label}>min</Text>
      </View>
    );
  }

/** r19 .pcard-cfg: Settings fold with focus and break minutes and the habit the blocks log to. */
function PomoSettings(p: { open: boolean; work: number; brk: number; builds: HabitDef[]; target: HabitDef | null;
  onWork: (v: number) => void; onBreak: (v: number) => void; onTarget: (id: string) => void; onAddFocus: () => void }) {
  const { c, s } = useTheme('move');
  const [open, setOpen] = useState(p.open);
  const [pick, setPick] = useState(false);
  useEffect(() => setOpen(p.open), [p.open]);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, gap: 10 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityState={{ expanded: open }}>
        <Text style={{ fontFamily: font.bold, fontSize: 12, color: c.ink2 }}>Settings</Text><Text style={{ color: c.muted }}>{open ? '–' : '+'}</Text>
      </Pressable>
      {open && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}><MinBox label="Focus" value={p.work} onSet={p.onWork} /><MinBox label="Break" value={p.brk} onSet={p.onBreak} /></View>
          {p.builds.length > 0 && (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.body}>Logs to</Text>
                <Pressable onPress={() => setPick((x) => !x)} accessibilityLabel="Logs to" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                  <Text style={s.body}>{p.target?.name ?? 'choose…'}</Text><Icon name="down" size={14} color={c.ink2} />
                </Pressable>
              </View>
              {pick && (
                <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, backgroundColor: c.surface, overflow: 'hidden', alignSelf: 'flex-start', minWidth: 180 }}>
                  {p.builds.map((h) => (
                    <Pressable key={h.id} onPress={() => { p.onTarget(h.id); setPick(false); }} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: p.target?.id === h.id ? c.surface2 : c.surface }}>
                      <Text style={s.body}>{h.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
          {!p.target && <Pressable style={[s.outline, { alignSelf: 'flex-start', minHeight: 38, borderRadius: 999, backgroundColor: c.surface }]} onPress={p.onAddFocus}><Text style={s.outlineText}>Add a focus habit</Text></Pressable>}
        </View>
      )}
    </View>
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
