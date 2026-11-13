// Six small home screen widgets, each about one thing, each with its own colour: the habit
// timer, habits, food, the lift day, your level, and steps. Bold gradients, white type, big
// numbers and rings. Pure: each draws the snapshot the app wrote, the timer store on the phone,
// and (while walking) the live walk tracker's count.
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { Timer } from '../lib/habitTimers';
import { isFresh, type Snapshot } from './snapshot';

export const WIDGETS = ['Timer', 'Habits', 'Food', 'Lift', 'Level', 'Steps'] as const;
export type WidgetName = (typeof WIDGETS)[number];
/** The live walk, when one is being tracked: its habit and steps so far. */
export type Live = { habitId: string; steps: number; running: boolean } | null;

type Hex = `#${string}`;
const W: Hex = '#FFFFFF', SOFT: Hex = '#FFFFFFB8', GLASS: Hex = '#FFFFFF26', GLASS2: Hex = '#FFFFFF40';
const GRAD: Record<string, [Hex, Hex]> = {
  steps: ['#0BA360', '#3CBA92'], food: ['#FF512F', '#F09819'], lift: ['#7F00FF', '#E100FF'],
  done: ['#11998E', '#38EF7D'], timer: ['#0F2027', '#2C5364'], habits: ['#1A2980', '#26D0CE'], stale: ['#232526', '#414345'],
};
const NEON: Hex = '#39FF88';
const TILE: Hex[] = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF', '#FF9F45'];

const n = (x: number) => Math.round(x).toLocaleString('en-IN');
const clock = (ms: number) => { const t = new Date(ms), h = t.getHours(); return `${((h + 11) % 12) + 1}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const mins = (ms: number) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const darken = (hex: string, f: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('') as Hex;

/** A progress ring with text in the middle, drawn as SVG. */
function ring(pct: number, big: string, small: string, color = '#FFFFFF', track = '#FFFFFF33') {
  const r = 42, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<circle cx="50" cy="50" r="${r}" stroke="${track}" stroke-width="10" fill="none"/>
<circle cx="50" cy="50" r="${r}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${(c * p) / 100} ${c}" transform="rotate(-90 50 50)"/>
<text x="50" y="${small ? 54 : 60}" font-size="${big.length > 3 ? 22 : 28}" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="#FFFFFF">${big}</text>
${small ? `<text x="50" y="70" font-size="11" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="#FFFFFFB8">${small}</text>` : ''}</svg>`;
}
/** The rank's shield, as in the app, with a soft glow. */
const shield = (num: number, tint: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<circle cx="50" cy="50" r="46" fill="#FFFFFF" fill-opacity="0.12"/>
<path d="M50 10 L78 21 Q80 22 80 25 L80 49 Q80 72 50 89 Q20 72 20 49 L20 25 Q20 22 22 21 Z" fill="${tint}" stroke="#FFFFFF" stroke-width="3.5"/>
<path d="M50 16 L74 25 L74 36 Q50 28 26 36 L26 25 Z" fill="#FFFFFF" fill-opacity="0.28"/>
<text x="50" y="62" font-size="${num >= 10 ? 28 : 34}" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="#101210">${num}</text></svg>`;
const dumbbell = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#FFFFFF" fill-opacity="0.2"/>
<g fill="#FFFFFF"><rect x="18" y="36" width="10" height="28" rx="3"/><rect x="29" y="30" width="9" height="40" rx="3"/><rect x="62" y="30" width="9" height="40" rx="3"/><rect x="72" y="36" width="10" height="28" rx="3"/><rect x="38" y="46" width="24" height="8" rx="2"/></g></svg>`;

/** The widget's card: a gradient; tapping empty space opens the app (or a deep link). */
function Card({ g, children, uri, gap = 6, pad = 12 }: { g: [Hex, Hex]; children: React.ReactNode; uri?: string; gap?: number; pad?: number }) {
  return (
    <FlexWidget clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'} clickActionData={uri ? { uri } : undefined}
      style={{ height: 'match_parent', width: 'match_parent', borderRadius: 24, padding: pad, flexDirection: 'column', justifyContent: 'center', flexGap: gap,
        backgroundGradient: { from: g[0], to: g[1], orientation: 'TL_BR' } }}>
      {children}
    </FlexWidget>
  );
}
const Label = ({ t, color = SOFT }: { t: string; color?: Hex }) => <TextWidget text={t} style={{ fontSize: 11, fontWeight: '700', color, letterSpacing: 0.12 }} maxLines={1} />;
function Pill({ text, uri, action, data, solid, ink = '#101210' }: { text: string; uri?: string; action?: string; data?: Record<string, unknown>; solid?: Hex; ink?: Hex }) {
  return (
    <FlexWidget clickAction={uri ? 'OPEN_URI' : action} clickActionData={uri ? { uri } : data}
      style={{ backgroundColor: solid ?? GLASS2, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 }}>
      <TextWidget text={text} style={{ fontSize: 12.5, fontWeight: '700', color: solid ? ink : W }} maxLines={1} />
    </FlexWidget>
  );
}
const Stale = ({ name }: { name: string }) => (
  <Card g={GRAD.stale}>
    <Label t={name.toUpperCase()} />
    <TextWidget text="Tap to load today" style={{ fontSize: 14, fontWeight: '700', color: W }} />
  </Card>
);

// ── Steps: a ring to the target, the count, and LIVE while a walk is tracked ──
function StepsW({ s, live }: { s: Snapshot | null; live: Live }) {
  if (!isFresh(s) || !s) return <Stale name="Steps" />;
  const steps = s.steps + (live?.steps ?? 0), pct = s.stepsTarget ? (steps / s.stepsTarget) * 100 : 0, hit = steps >= s.stepsTarget;
  return (
    <Card g={hit ? GRAD.done : GRAD.steps} uri="recomp:///" pad={10}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
        <SvgWidget svg={ring(pct, hit ? '✓' : `${Math.round(pct)}%`, '')} style={{ width: 54, height: 54 }} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          {live ? <TextWidget text={live.running ? '● LIVE' : '❚❚ PAUSED'} style={{ fontSize: 10.5, fontWeight: '700', color: live.running ? '#FFF35C' : SOFT }} /> : <Label t="STEPS" />}
          <TextWidget text={n(steps)} style={{ fontSize: 24, fontWeight: '700', color: W }} maxLines={1} />
          <TextWidget text={live ? `+${n(live.steps)} this walk` : `of ${n(s.stepsTarget)}`} style={{ fontSize: 11, color: SOFT }} maxLines={1} />
        </FlexWidget>
      </FlexWidget>
    </Card>
  );
}

// ── Food: a ring of calories eaten, what's left, protein, and a quick add ──
function FoodW({ s }: { s: Snapshot | null }) {
  if (!isFresh(s) || !s) return <Stale name="Food" />;
  const over = s.kcalLeft < 0, eaten = s.kcalTarget - s.kcalLeft, pct = s.kcalTarget ? (eaten / s.kcalTarget) * 100 : 0;
  return (
    <Card g={GRAD.food} uri="recomp:///food" gap={6}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <SvgWidget svg={ring(pct, n(Math.abs(s.kcalLeft)), over ? 'OVER' : 'LEFT', over ? '#FFF35C' : '#FFFFFF')} style={{ width: 70, height: 70 }} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <Label t="KCAL" />
          <TextWidget text={s.proteinLeft > 0 ? `${n(s.proteinLeft)} g` : '✓'} style={{ fontSize: 18, fontWeight: '700', color: W }} maxLines={1} />
          <TextWidget text={s.proteinLeft > 0 ? 'protein to go' : 'protein done'} style={{ fontSize: 10.5, color: SOFT }} maxLines={1} />
        </FlexWidget>
      </FlexWidget>
      <Pill text="+ Add food" uri="recomp:///food?focus=1" solid={W} ink="#E2531F" />
    </Card>
  );
}

// ── Lift: today's lift, the 10-minute version, or the win ──
function LiftW({ s }: { s: Snapshot | null }) {
  if (!isFresh(s) || !s) return <Stale name="Lift" />;
  const done = s.lift === 'done' || s.lift === 'warm', todo = s.lift === 'todo';
  const head = done ? 'LIFTED' : todo ? 'LIFT DAY' : s.lift === 'rest' ? 'REST DAY' : s.lift === 'cardio' ? 'CARDIO DAY' : 'TRAIN';
  return (
    <Card g={done ? GRAD.done : GRAD.lift} uri="recomp:///train" pad={10}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
        <SvgWidget svg={dumbbell} style={{ width: 44, height: 44 }} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <Label t={head} />
          <TextWidget text={done ? 'Done. That counts.' : s.liftLine || 'Nothing planned'} style={{ fontSize: 14, fontWeight: '700', color: W }} maxLines={2} truncate="END" />
        </FlexWidget>
        {todo && <Pill text="▶ 10 min" uri="recomp:///session?short=1" solid={W} ink="#7F00FF" />}
      </FlexWidget>
    </Card>
  );
}

// ── Timer: the running habit in neon, or quick starts ──
function TimerW({ s, timers, now, live }: { s: Snapshot | null; timers: Record<string, Timer>; now: number; live: Live }) {
  const id = Object.keys(timers).find((k) => timers[k]?.running) ?? Object.keys(timers).find((k) => timers[k]) ?? null;
  if (!id) {
    const timed = (s?.habits ?? []).filter((h) => h.timed).slice(0, 2);
    return (
      <Card g={GRAD.timer} pad={11}>
        <Label t="HABIT TIMER" color={NEON} />
        {timed.length ? (
          <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
            {timed.map((h) => <Pill key={h.id} text={`▶ ${h.name}`} action="TIMER_START" data={{ id: h.id }} />)}
          </FlexWidget>
        ) : <TextWidget text="Ready when you are" style={{ fontSize: 14, fontWeight: '700', color: W }} />}
      </Card>
    );
  }
  const t = timers[id], ms = (t.accumMs || 0) + (t.running ? now - t.startedAt : 0), first = t.segs?.[0]?.s ?? t.startedAt;
  const walkSteps = live && live.habitId === id ? live.steps : null;
  return (
    <Card g={GRAD.timer} uri={`recomp:///?habit=${id}`} pad={11}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={`${t.running ? '●' : '❚❚'} ${(s?.names[id] ?? 'Timer').toUpperCase()}`} style={{ fontSize: 11, fontWeight: '700', color: t.running ? NEON : SOFT }} maxLines={1} truncate="END" />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', flexGap: 4 }}>
            <TextWidget text={mins(ms)} style={{ fontSize: 30, fontWeight: '700', color: t.running ? NEON : W }} maxLines={1} />
            <TextWidget text={ms >= 3600000 ? 'h' : 'min'} style={{ fontSize: 13, fontWeight: '700', color: SOFT }} />
          </FlexWidget>
          <TextWidget text={walkSteps != null ? `${n(walkSteps)} steps · since ${clock(first)}` : t.running ? `since ${clock(first)}` : 'paused'} style={{ fontSize: 10.5, color: SOFT }} maxLines={1} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>
          <Pill text={t.running ? 'Pause' : 'Resume'} action={t.running ? 'TIMER_PAUSE' : 'TIMER_START'} data={{ id }} />
          <Pill text="Stop" uri={`recomp:///?stop=${id}`} solid={NEON} />
        </FlexWidget>
      </FlexWidget>
    </Card>
  );
}

// ── Habits: a colourful tile per habit; timed ones start from here ──
function HabitsW({ s, timers }: { s: Snapshot | null; timers: Record<string, Timer> }) {
  if (!isFresh(s) || !s) return <Stale name="Habits" />;
  const hs = s.habits, rows = [hs.slice(0, 3), hs.slice(3, 6)].filter((r) => r.length);
  const done = hs.filter((h) => h.met).length;
  return (
    <Card g={GRAD.habits} uri="recomp:///" gap={6} pad={11}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label t="HABITS" color={W} />
        <TextWidget text={hs.length ? `${done}/${hs.length} done` : ''} style={{ fontSize: 11, fontWeight: '700', color: done === hs.length && hs.length ? '#FFF35C' : SOFT }} />
      </FlexWidget>
      {!hs.length && <TextWidget text="Add habits in the app" style={{ fontSize: 13, fontWeight: '700', color: W }} />}
      {rows.map((r, ri) => (
        <FlexWidget key={ri} style={{ width: 'match_parent', flexDirection: 'row', flexGap: 6 }}>
          {r.map((h, i) => {
            const on = !!timers[h.id]?.running, col = TILE[(ri * 3 + i) % TILE.length];
            return (
              <FlexWidget key={h.id} clickAction={h.timed ? 'TIMER_START' : 'OPEN_URI'} clickActionData={h.timed ? { id: h.id } : { uri: `recomp:///?habit=${h.id}` }}
                style={{ flex: 1, flexDirection: 'column', backgroundColor: h.met || on ? col : GLASS, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 7 }}>
                <TextWidget text={(h.met ? '✓ ' : on ? '● ' : h.timed ? '▶ ' : '') + h.name} style={{ fontSize: 11.5, fontWeight: '700', color: h.met || on ? '#101210' : W }} maxLines={1} truncate="END" />
                <TextWidget text={on ? 'running' : h.val} style={{ fontSize: 10.5, color: h.met || on ? '#101210B0' : SOFT }} maxLines={1} />
              </FlexWidget>
            );
          })}
        </FlexWidget>
      ))}
    </Card>
  );
}

// ── Level: the rank's shield on its own colour, progress, streak ──
function LevelW({ s }: { s: Snapshot | null }) {
  const r = s?.rank;
  if (!r) return <Stale name="Level" />;
  const g: [Hex, Hex] = [darken(r.tint, 0.85), darken(r.tint, 0.38)];
  const pct = Math.max(0, Math.min(100, Math.round(r.pct)));
  return (
    <Card g={g} uri="recomp:///" gap={5} pad={11}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <SvgWidget svg={shield(r.i + 1, r.tint)} style={{ width: 50, height: 50 }} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <Label t={`LEVEL ${r.i + 1}`} />
          <TextWidget text={r.name} style={{ fontSize: 16, fontWeight: '700', color: W }} maxLines={1} truncate="END" />
          {s && s.streak > 1 ? <TextWidget text={`🔥 ${s.streak} in a row`} style={{ fontSize: 10.5, fontWeight: '700', color: W }} maxLines={1} /> : null}
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', height: 8, flexDirection: 'row', backgroundColor: GLASS, borderRadius: 4 }}>
        <FlexWidget style={{ flex: Math.max(1, pct), height: 8, backgroundColor: W, borderRadius: 4 }} />
        <FlexWidget style={{ flex: Math.max(0, 100 - pct), height: 8 }} />
      </FlexWidget>
      <TextWidget text={r.next ? `${r.need} day${r.need === 1 ? '' : 's'} won → ${r.next}` : 'Top rank. Keep it.'} style={{ fontSize: 11, fontWeight: '700', color: SOFT }} maxLines={1} />
    </Card>
  );
}

export function renderWidget(name: string, s: Snapshot | null, timers: Record<string, Timer>, live: Live = null, now = Date.now()) {
  switch (name as WidgetName) {
    case 'Timer': return <TimerW s={s} timers={timers} now={now} live={live} />;
    case 'Habits': return <HabitsW s={s} timers={timers} />;
    case 'Food': return <FoodW s={s} />;
    case 'Lift': return <LiftW s={s} />;
    case 'Level': return <LevelW s={s} />;
    default: return <StepsW s={s} live={live} />;
  }
}
