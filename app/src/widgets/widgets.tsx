// Six small home screen widgets in the Dot Matrix style: black tiles, white dot-matrix numbers
// (Doto), Space Grotesk labels, and one red accent kept for what needs you (a live walk, today's
// lift, the streak). Pure: each draws the snapshot the app wrote, the timer store on the phone,
// and (while walking) the live walk tracker's count. The fonts ship in assets/fonts.
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { Timer } from '../lib/habitTimers';
import { isFresh, type Snapshot } from './snapshot';

export const WIDGETS = ['Timer', 'Habits', 'Food', 'Lift', 'Level', 'Steps'] as const;
export type WidgetName = (typeof WIDGETS)[number];
/** The live walk, when one is being tracked: its habit and steps so far. */
export type Live = { habitId: string; steps: number; running: boolean } | null;

type Hex = `#${string}`;
const BG: Hex = '#000000', W: Hex = '#FFFFFF', GREY: Hex = '#8C8C8C', EDGE: Hex = '#2C2C2C', OFF: Hex = '#2B2B2B', RED: Hex = '#FF2A1C';
const DOT = 'Doto-Black', LABEL = 'SpaceGrotesk-Medium', BOLD = 'SpaceGrotesk-Bold';

const n = (x: number) => Math.round(x).toLocaleString('en-IN');
const clock = (ms: number) => { const t = new Date(ms), h = t.getHours(); return `${((h + 11) % 12) + 1}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

/** The black tile; tapping empty space opens the app (or a deep link). */
function Tile({ children, uri, gap = 4 }: { children: React.ReactNode; uri?: string; gap?: number }) {
  return (
    <FlexWidget clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'} clickActionData={uri ? { uri } : undefined}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 26, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'column', justifyContent: 'center', flexGap: gap }}>
      {children}
    </FlexWidget>
  );
}
/** The small caps label row: left text, optional right text (red when it needs you). */
function Label({ left, right, leftRed, rightRed }: { left: string; right?: string; leftRed?: boolean; rightRed?: boolean }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <TextWidget text={left.toUpperCase()} style={{ fontSize: 10, fontFamily: LABEL, letterSpacing: 0.14, color: leftRed ? RED : GREY }} maxLines={1} />
      {right ? <TextWidget text={right.toUpperCase()} style={{ fontSize: 10, fontFamily: LABEL, letterSpacing: 0.14, color: rightRed ? RED : GREY }} maxLines={1} /> : <FlexWidget />}
    </FlexWidget>
  );
}
const Dots = ({ t, size, color = W }: { t: string; size: number; color?: Hex }) => <TextWidget text={t} style={{ fontSize: size, fontFamily: DOT, color }} maxLines={1} />;
const Small = ({ t, color = GREY, bold }: { t: string; color?: Hex; bold?: boolean }) => <TextWidget text={t} style={{ fontSize: 11, fontFamily: bold ? BOLD : LABEL, color }} maxLines={1} truncate="END" />;
/** A pill button: white filled, or white outline. */
function Btn({ text, filled, uri, action, data }: { text: string; filled?: boolean; uri?: string; action?: string; data?: Record<string, unknown> }) {
  return (
    <FlexWidget clickAction={uri ? 'OPEN_URI' : action} clickActionData={uri ? { uri } : data}
      style={{ backgroundColor: filled ? W : BG, borderColor: W, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 4 }}>
      <TextWidget text={text.toUpperCase()} style={{ fontSize: 11, fontFamily: BOLD, letterSpacing: 0.06, color: filled ? BG : W }} maxLines={1} />
    </FlexWidget>
  );
}
/** A row of pips: one per step of progress (filled white, the rest dark). */
function Pips({ total, on }: { total: number; on: number }) {
  const count = Math.max(1, Math.min(20, total));
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 3 }}>
      {Array.from({ length: count }, (_, i) => <FlexWidget key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < on ? W : OFF }} />)}
    </FlexWidget>
  );
}
const Stale = ({ name }: { name: string }) => (
  <Tile>
    <Label left={name} />
    <TextWidget text="Tap to load today" style={{ fontSize: 13, fontFamily: BOLD, color: W }} />
  </Tile>
);

// ── Steps: the count in dots, LIVE in red while a walk is tracked ──
function StepsW({ s, live }: { s: Snapshot | null; live: Live }) {
  if (!isFresh(s) || !s) return <Stale name="Steps" />;
  const steps = s.steps + (live?.steps ?? 0), pct = s.stepsTarget ? Math.round((steps / s.stepsTarget) * 100) : 0, hit = steps >= s.stepsTarget;
  return (
    <Tile uri="recomp:///">
      <Label left={live ? (live.running ? '● Live' : '❚❚ Paused') : 'Steps'} leftRed={!!live?.running} right={hit ? '✓ Target' : `${pct}%`} />
      <Dots t={n(steps)} size={30} />
    </Tile>
  );
}

// ── Food: calories left in dots, protein, and a quick add ──
function FoodW({ s }: { s: Snapshot | null }) {
  if (!isFresh(s) || !s) return <Stale name="Food" />;
  const over = s.kcalLeft < 0;
  return (
    <Tile uri="recomp:///food" gap={6}>
      <Label left="Food" right={over ? 'kcal over' : 'kcal left'} rightRed={over} />
      <Dots t={n(Math.abs(s.kcalLeft))} size={42} color={over ? RED : W} />
      <Small t={s.proteinLeft > 0 ? `${n(s.proteinLeft)} g protein to go` : 'Protein done ✓'} />
      <FlexWidget style={{ flexDirection: 'row' }}><Btn text="+ Add" filled uri="recomp:///food?focus=1" /></FlexWidget>
    </Tile>
  );
}

// ── Lift: today's lift and the 10-minute version ──
function LiftW({ s }: { s: Snapshot | null }) {
  if (!isFresh(s) || !s) return <Stale name="Lift" />;
  const done = s.lift === 'done' || s.lift === 'warm', todo = s.lift === 'todo';
  const head = todo || done ? 'Lift' : s.lift === 'rest' ? 'Rest day' : s.lift === 'cardio' ? 'Cardio day' : 'Train';
  return (
    <Tile uri="recomp:///train">
      <Label left={head} right={todo ? '●' : done ? '✓' : undefined} rightRed={todo} />
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 8 }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={done ? 'Done. That counts.' : (s.liftLine || 'Nothing planned').replace(/^Lift /, '')} style={{ fontSize: 12.5, fontFamily: BOLD, color: W }} maxLines={2} truncate="END" />
        </FlexWidget>
        {todo && <Btn text="10 min" filled uri="recomp:///session?short=1" />}
      </FlexWidget>
    </Tile>
  );
}

// ── Timer: the running habit in dots, or quick starts ──
function TimerW({ s, timers, now, live }: { s: Snapshot | null; timers: Record<string, Timer>; now: number; live: Live }) {
  const id = Object.keys(timers).find((k) => timers[k]?.running) ?? Object.keys(timers).find((k) => timers[k]) ?? null;
  if (!id) {
    const timed = (s?.habits ?? []).filter((h) => h.timed).slice(0, 3);
    return (
      <Tile gap={8}>
        <Label left="Habit timer" right="Ready" />
        {timed.length ? (
          <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
            {timed.map((h) => <Btn key={h.id} text={`▶ ${h.name}`} action="TIMER_START" data={{ id: h.id }} />)}
          </FlexWidget>
        ) : <Small t="Start a timed habit in the app" color={W} />}
      </Tile>
    );
  }
  const t = timers[id], ms = (t.accumMs || 0) + (t.running ? now - t.startedAt : 0), m = Math.floor(ms / 60000), first = t.segs?.[0]?.s ?? t.startedAt;
  const walkSteps = live && live.habitId === id ? live.steps : null;
  const name = s?.names[id] ?? 'Timer';
  return (
    <Tile uri={`recomp:///?habit=${id}`}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 8 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 2 }}>
          <Label left={`${t.running ? '● ' : '❚❚ '}${name}`} leftRed={t.running} right={t.running ? `since ${clock(first)}` : 'paused'} />
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', flexGap: 8 }}>
            <Dots t={m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : String(m)} size={36} />
            <Small t={(m >= 60 ? 'h' : 'min') + (walkSteps != null ? `  ·  ${n(walkSteps)} steps` : '')} />
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>
          <Btn text={t.running ? 'Pause' : 'Resume'} action={t.running ? 'TIMER_PAUSE' : 'TIMER_START'} data={{ id }} />
          <Btn text="Stop" filled uri={`recomp:///?stop=${id}`} />
        </FlexWidget>
      </FlexWidget>
    </Tile>
  );
}

// ── Habits: outlined tiles, white when done; timed ones start from here ──
function HabitsW({ s, timers }: { s: Snapshot | null; timers: Record<string, Timer> }) {
  if (!isFresh(s) || !s) return <Stale name="Habits" />;
  const hs = s.habits, rows = [hs.slice(0, 3), hs.slice(3, 6)].filter((r) => r.length);
  return (
    <Tile uri="recomp:///" gap={7}>
      <Label left="Habits" right={hs.length ? `${hs.filter((h) => h.met).length} / ${hs.length}` : undefined} />
      {!hs.length && <Small t="Add habits in the app" color={W} />}
      {rows.map((r, ri) => (
        <FlexWidget key={ri} style={{ width: 'match_parent', flexDirection: 'row', flexGap: 7 }}>
          {r.map((h) => {
            const on = !!timers[h.id]?.running;
            return (
              <FlexWidget key={h.id} clickAction={h.timed ? 'TIMER_START' : 'OPEN_URI'} clickActionData={h.timed ? { id: h.id } : { uri: `recomp:///?habit=${h.id}` }}
                style={{ flex: 1, flexDirection: 'column', borderRadius: 14, borderWidth: 1.5, borderColor: on ? RED : h.met ? W : EDGE, paddingHorizontal: 8, paddingVertical: 6 }}>
                <TextWidget text={(h.met ? '✓ ' : on ? '● ' : '') + h.name} style={{ fontSize: 11.5, fontFamily: BOLD, color: on ? RED : W }} maxLines={1} truncate="END" />
                <TextWidget text={on ? 'running' : h.val} style={{ fontSize: 10.5, fontFamily: LABEL, color: GREY }} maxLines={1} />
              </FlexWidget>
            );
          })}
        </FlexWidget>
      ))}
    </Tile>
  );
}

// ── Level: the rank, the streak in red, one pip per day to the next rank ──
function LevelW({ s }: { s: Snapshot | null }) {
  const r = s?.rank;
  if (!r) return <Stale name="Level" />;
  return (
    <Tile uri="recomp:///" gap={7}>
      <Label left={`Level ${r.i + 1}`} right={s && s.streak > 0 ? `● ${s.streak}` : undefined} rightRed />
      <TextWidget text={r.name} style={{ fontSize: 19, fontFamily: BOLD, color: W }} maxLines={1} truncate="END" />
      <Pips total={r.span ?? 1} on={r.done ?? 1} />
      <Small t={r.next ? `${r.need} day${r.need === 1 ? '' : 's'} to ${r.next}` : 'Top rank. Keep it.'} />
    </Tile>
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
