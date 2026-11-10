// The "Today" home screen widget: calories and protein left, walk steps, and the lift day, with
// one-tap buttons into Food and the 10-minute session. Pure: draws a snapshot.
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { Timer } from '../lib/habitTimers';
import { isFresh, type Snapshot } from './snapshot';

type Hex = `#${string}`;
type Pal = Record<'bg' | 'card' | 'ink' | 'muted' | 'food' | 'protein' | 'move' | 'train' | 'btn' | 'btnInk', Hex>;
const DARK: Pal = { bg: '#141614', card: '#1F221F', ink: '#F2F4F0', muted: '#9AA29A', food: '#F5B82E', protein: '#7FB2FF', move: '#9BE15D', train: '#FF8A5B', btn: '#F2F4F0', btnInk: '#141614' };
const LIGHT: Pal = { bg: '#FBFBF8', card: '#EFF1EC', ink: '#161816', muted: '#646B64', food: '#B57D00', protein: '#2F6FD6', move: '#3F8F1F', train: '#C9531E', btn: '#161816', btnInk: '#FBFBF8' };

const n = (x: number) => Math.round(x).toLocaleString('en-IN');
const clock = (ms: number) => { const t = new Date(ms), h = t.getHours(); return `${((h + 11) % 12) + 1}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const dur = (ms: number) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

/** The running (or paused) habit timer: name, time so far, and pause, resume and stop. */
function TimerRow({ id, t, name, now, p }: { id: string; t: Timer; name: string; now: number; p: Pal }) {
  const ms = (t.accumMs || 0) + (t.running ? now - t.startedAt : 0);
  const first = t.segs?.[0]?.s ?? t.startedAt;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: `recomp:///?habit=${id}` }}
      style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: p.card, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, flexGap: 8 }}>
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text={`${t.running ? '● ' : '❚❚ '}${name}  ${dur(ms)}`} style={{ fontSize: 15, fontWeight: '700', color: t.running ? p.move : p.muted }} maxLines={1} truncate="END" />
        <TextWidget text={t.running ? `Running since ${clock(first)}` : 'Paused'} style={{ fontSize: 11, color: p.muted }} maxLines={1} />
      </FlexWidget>
      <FlexWidget clickAction={t.running ? 'TIMER_PAUSE' : 'TIMER_START'} clickActionData={{ id }} style={{ backgroundColor: p.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
        <TextWidget text={t.running ? 'Pause' : 'Resume'} style={{ fontSize: 12.5, fontWeight: '700', color: p.ink }} />
      </FlexWidget>
      <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: `recomp:///?stop=${id}` }} style={{ backgroundColor: p.btn, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
        <TextWidget text="Stop" style={{ fontSize: 12.5, fontWeight: '700', color: p.btnInk }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** A habit: tap a timed one to start its timer right here; any other opens it in the app. */
function Chip({ h, p, on }: { h: Snapshot['habits'][number]; p: Pal; on: boolean }) {
  return (
    <FlexWidget clickAction={h.timed ? 'TIMER_START' : 'OPEN_URI'} clickActionData={h.timed ? { id: h.id } : { uri: `recomp:///?habit=${h.id}` }}
      style={{ flex: 1, flexDirection: 'column', backgroundColor: on ? p.move : p.card, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 }}>
      <TextWidget text={(h.met ? '✓ ' : h.timed && !on ? '▶ ' : '') + h.name} style={{ fontSize: 11.5, fontWeight: '700', color: on ? p.btnInk : h.met ? p.move : p.ink }} maxLines={1} truncate="END" />
      <TextWidget text={on ? 'running' : h.val} style={{ fontSize: 10.5, color: on ? p.btnInk : p.muted }} maxLines={1} />
    </FlexWidget>
  );
}

function Stat({ value, label, color, p }: { value: string; label: string; color: Hex; p: Pal }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', backgroundColor: p.card, borderRadius: 14, padding: 8 }}>
      <TextWidget text={value} style={{ fontSize: 19, fontWeight: '700', color }} maxLines={1} />
      <TextWidget text={label} style={{ fontSize: 11, color: p.muted }} maxLines={1} />
    </FlexWidget>
  );
}

function Btn({ text, uri, p, filled }: { text: string; uri: string; p: Pal; filled?: boolean }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }}
      style={{ backgroundColor: filled ? p.btn : p.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
      <TextWidget text={text} style={{ fontSize: 12.5, fontWeight: '700', color: filled ? p.btnInk : p.ink }} />
    </FlexWidget>
  );
}

function Body({ s, p, timers, now }: { s: Snapshot | null; p: Pal; timers: Record<string, Timer>; now: number }) {
  if (!isFresh(s) || !s) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget text="Project Recomp" style={{ fontSize: 15, fontWeight: '700', color: p.ink }} />
        <TextWidget text="Open the app to load today." style={{ fontSize: 12.5, color: p.muted }} />
      </FlexWidget>
    );
  }
  const kOver = s.kcalLeft < 0;
  // The running timer first, else one that's paused.
  const tid = Object.keys(timers).find((k) => timers[k]?.running) ?? Object.keys(timers).find((k) => timers[k]) ?? null;
  const liftColor = s.lift === 'done' || s.lift === 'warm' ? p.move : s.lift === 'todo' ? p.train : p.muted;
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 22, padding: 12, flexDirection: 'column', flexGap: 8 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget text="Today" style={{ fontSize: 14, fontWeight: '700', color: p.ink }} />
        <TextWidget text={[s.level, s.streak > 1 ? `${s.streak}-day streak` : null].filter(Boolean).join(' · ')} style={{ fontSize: 11.5, color: p.muted }} maxLines={1} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 6 }}>
        <Stat p={p} value={n(Math.abs(s.kcalLeft))} label={kOver ? 'kcal over' : 'kcal left'} color={kOver ? p.train : p.food} />
        <Stat p={p} value={`${n(s.proteinLeft)} g`} label="protein to go" color={p.protein} />
        <Stat p={p} value={n(s.steps)} label={`of ${n(s.stepsTarget)} steps`} color={p.move} />
      </FlexWidget>
      {tid && <TimerRow id={tid} t={timers[tid]} name={s.names[tid] ?? 'Timer'} now={now} p={p} />}
      {s.habits.length > 0 && (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 5 }}>
          {s.habits.map((h) => <Chip key={h.id} h={h} p={p} on={!!timers[h.id]?.running} />)}
        </FlexWidget>
      )}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexGap: 6 }}>
        <TextWidget text={s.liftLine} style={{ fontSize: 12.5, fontWeight: '600', color: liftColor }} maxLines={1} truncate="END" />
        <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
          <Btn p={p} text="+ Food" uri="recomp:///food?focus=1" />
          {s.lift === 'todo' && <Btn p={p} filled text="▶ 10 min" uri="recomp:///session?short=1" />}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

/** Light and dark versions; the launcher picks by the phone's theme. */
export function todayWidget(s: Snapshot | null, timers: Record<string, Timer>, now = Date.now()) {
  return { light: <Body s={s} p={LIGHT} timers={timers} now={now} />, dark: <Body s={s} p={DARK} timers={timers} now={now} /> };
}
