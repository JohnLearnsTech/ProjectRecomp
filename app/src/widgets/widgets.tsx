// Six small home screen widgets, each about one thing: the habit timer, habits, food, the lift
// day, your level, and steps. Pure: each draws the snapshot the app wrote (and, for timers, the
// timer store on the phone). Light and dark versions; the launcher picks by the phone's theme.
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { Timer } from '../lib/habitTimers';
import { isFresh, type Snapshot } from './snapshot';

export const WIDGETS = ['Timer', 'Habits', 'Food', 'Lift', 'Level', 'Steps'] as const;
export type WidgetName = (typeof WIDGETS)[number];

type Hex = `#${string}`;
type Pal = Record<'bg' | 'card' | 'ink' | 'muted' | 'food' | 'protein' | 'move' | 'train' | 'btn' | 'btnInk', Hex>;
const DARK: Pal = { bg: '#141614', card: '#1F221F', ink: '#F2F4F0', muted: '#9AA29A', food: '#F5B82E', protein: '#7FB2FF', move: '#9BE15D', train: '#FF8A5B', btn: '#F2F4F0', btnInk: '#141614' };
const LIGHT: Pal = { bg: '#FBFBF8', card: '#EFF1EC', ink: '#161816', muted: '#646B64', food: '#B57D00', protein: '#2F6FD6', move: '#3F8F1F', train: '#C9531E', btn: '#161816', btnInk: '#FBFBF8' };

const n = (x: number) => Math.round(x).toLocaleString('en-IN');
const clock = (ms: number) => { const t = new Date(ms), h = t.getHours(); return `${((h + 11) % 12) + 1}:${String(t.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const dur = (ms: number) => { const m = Math.floor(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };

/** The widget's background card; tapping empty space opens the app (or a deep link). */
function Frame({ p, children, uri, gap = 6 }: { p: Pal; children: React.ReactNode; uri?: string; gap?: number }) {
  return (
    <FlexWidget clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'} clickActionData={uri ? { uri } : undefined}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 22, padding: 12, flexDirection: 'column', justifyContent: 'center', flexGap: gap }}>
      {children}
    </FlexWidget>
  );
}
const Title = ({ t, p, right }: { t: string; p: Pal; right?: string }) => (
  <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <TextWidget text={t} style={{ fontSize: 12, fontWeight: '700', color: p.muted }} maxLines={1} />
    {right ? <TextWidget text={right} style={{ fontSize: 11.5, color: p.muted }} maxLines={1} /> : <FlexWidget />}
  </FlexWidget>
);
function Btn({ text, p, filled, uri, action, data }: { text: string; p: Pal; filled?: boolean; uri?: string; action?: string; data?: Record<string, unknown> }) {
  return (
    <FlexWidget clickAction={uri ? 'OPEN_URI' : action} clickActionData={uri ? { uri } : data}
      style={{ backgroundColor: filled ? p.btn : p.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
      <TextWidget text={text} style={{ fontSize: 12.5, fontWeight: '700', color: filled ? p.btnInk : p.ink }} maxLines={1} />
    </FlexWidget>
  );
}
const Stale = ({ p, name }: { p: Pal; name: string }) => (
  <Frame p={p}>
    <TextWidget text={name} style={{ fontSize: 14, fontWeight: '700', color: p.ink }} />
    <TextWidget text="Open Recomp to load today." style={{ fontSize: 12, color: p.muted }} />
  </Frame>
);

// ── Timer: the running habit, or quick starts for timed habits ──
function TimerW({ s, p, timers, now }: { s: Snapshot | null; p: Pal; timers: Record<string, Timer>; now: number }) {
  const id = Object.keys(timers).find((k) => timers[k]?.running) ?? Object.keys(timers).find((k) => timers[k]) ?? null;
  if (!id) {
    const timed = (s?.habits ?? []).filter((h) => h.timed).slice(0, 2);
    return (
      <Frame p={p}>
        <Title t="Habit timer" p={p} />
        {timed.length ? (
          <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
            {timed.map((h) => <Btn key={h.id} p={p} text={`▶ ${h.name}`} action="TIMER_START" data={{ id: h.id }} />)}
          </FlexWidget>
        ) : <TextWidget text="Nothing running. Start a timed habit in the app." style={{ fontSize: 12, color: p.muted }} maxLines={2} />}
      </Frame>
    );
  }
  const t = timers[id], ms = (t.accumMs || 0) + (t.running ? now - t.startedAt : 0), first = t.segs?.[0]?.s ?? t.startedAt;
  return (
    <Frame p={p} uri={`recomp:///?habit=${id}`}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 8 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={`${t.running ? '● ' : '❚❚ '}${s?.names[id] ?? 'Timer'}`} style={{ fontSize: 13, fontWeight: '700', color: t.running ? p.move : p.muted }} maxLines={1} truncate="END" />
          <TextWidget text={dur(ms)} style={{ fontSize: 24, fontWeight: '700', color: p.ink }} maxLines={1} />
          <TextWidget text={t.running ? `since ${clock(first)}` : 'paused'} style={{ fontSize: 11, color: p.muted }} maxLines={1} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>
          <Btn p={p} text={t.running ? 'Pause' : 'Resume'} action={t.running ? 'TIMER_PAUSE' : 'TIMER_START'} data={{ id }} />
          <Btn p={p} filled text="Stop" uri={`recomp:///?stop=${id}`} />
        </FlexWidget>
      </FlexWidget>
    </Frame>
  );
}

// ── Habits: today's value for up to six; a timed one starts its timer from here ──
function HabitsW({ s, p, timers }: { s: Snapshot | null; p: Pal; timers: Record<string, Timer> }) {
  if (!isFresh(s) || !s) return <Stale p={p} name="Habits" />;
  const hs = s.habits, rows = [hs.slice(0, 3), hs.slice(3, 6)].filter((r) => r.length);
  const done = hs.filter((h) => h.met).length;
  return (
    <Frame p={p} uri="recomp:///" gap={5}>
      <Title t="Habits" p={p} right={hs.length ? `${done} of ${hs.length} done` : undefined} />
      {!hs.length && <TextWidget text="Add habits in the app." style={{ fontSize: 12, color: p.muted }} />}
      {rows.map((r, i) => (
        <FlexWidget key={i} style={{ width: 'match_parent', flexDirection: 'row', flexGap: 5 }}>
          {r.map((h) => {
            const on = !!timers[h.id]?.running;
            return (
              <FlexWidget key={h.id} clickAction={h.timed ? 'TIMER_START' : 'OPEN_URI'} clickActionData={h.timed ? { id: h.id } : { uri: `recomp:///?habit=${h.id}` }}
                style={{ flex: 1, flexDirection: 'column', backgroundColor: on ? p.move : p.card, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 }}>
                <TextWidget text={(h.met ? '✓ ' : h.timed && !on ? '▶ ' : '') + h.name} style={{ fontSize: 11.5, fontWeight: '700', color: on ? p.btnInk : h.met ? p.move : p.ink }} maxLines={1} truncate="END" />
                <TextWidget text={on ? 'running' : h.val} style={{ fontSize: 10.5, color: on ? p.btnInk : p.muted }} maxLines={1} />
              </FlexWidget>
            );
          })}
        </FlexWidget>
      ))}
    </Frame>
  );
}

// ── Food: calories and protein left, and a quick add ──
function FoodW({ s, p }: { s: Snapshot | null; p: Pal }) {
  if (!isFresh(s) || !s) return <Stale p={p} name="Food" />;
  const over = s.kcalLeft < 0;
  return (
    <Frame p={p} uri="recomp:///food" gap={4}>
      <Title t="Food" p={p} />
      <TextWidget text={n(Math.abs(s.kcalLeft))} style={{ fontSize: 26, fontWeight: '700', color: over ? p.train : p.food }} maxLines={1} />
      <TextWidget text={over ? 'kcal over' : 'kcal left'} style={{ fontSize: 11.5, color: p.muted }} />
      <TextWidget text={s.proteinLeft > 0 ? `${n(s.proteinLeft)} g protein to go` : 'Protein done ✓'} style={{ fontSize: 12, fontWeight: '600', color: p.protein }} maxLines={1} />
      <Btn p={p} filled text="+ Food" uri="recomp:///food?focus=1" />
    </Frame>
  );
}

// ── Lift: today's lift and the 10-minute version ──
function LiftW({ s, p }: { s: Snapshot | null; p: Pal }) {
  if (!isFresh(s) || !s) return <Stale p={p} name="Lift" />;
  const done = s.lift === 'done' || s.lift === 'warm';
  return (
    <Frame p={p} uri="recomp:///train">
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 8 }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={s.lift === 'todo' ? 'Lift day' : done ? 'Lift day' : s.lift === 'rest' ? 'Rest day' : s.lift === 'cardio' ? 'Cardio day' : 'Train'} style={{ fontSize: 12, fontWeight: '700', color: p.muted }} />
          <TextWidget text={s.liftLine || 'Nothing planned'} style={{ fontSize: 14, fontWeight: '700', color: done ? p.move : s.lift === 'todo' ? p.train : p.ink }} maxLines={2} truncate="END" />
        </FlexWidget>
        {s.lift === 'todo' && <Btn p={p} filled text="▶ 10 min" uri="recomp:///session?short=1" />}
      </FlexWidget>
    </Frame>
  );
}

/** The rank's shield, as in the app. */
const shield = (n: number, tint: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 8 L80 20 Q82 21 82 24 L82 50 Q82 74 50 92 Q18 74 18 50 L18 24 Q18 21 20 20 Z" fill="${tint}" stroke="#00000040" stroke-width="3"/><path d="M50 14 L76 24 L76 36 Q50 27 24 36 L24 24 Z" fill="#ffffff" fill-opacity="0.2"/><text x="50" y="62" font-size="${n >= 10 ? 30 : 36}" font-weight="700" font-family="sans-serif" text-anchor="middle" fill="#101210">${n}</text></svg>`;

// ── Level: your rank, the streak, and how close the next one is ──
function LevelW({ s, p }: { s: Snapshot | null; p: Pal }) {
  const r = s?.rank;
  if (!r) return <Stale p={p} name="Level" />;
  const tint = r.tint as Hex;
  return (
    <Frame p={p} uri="recomp:///" gap={4}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <SvgWidget svg={shield(r.i + 1, r.tint)} style={{ width: 44, height: 44 }} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={`LEVEL ${r.i + 1}`} style={{ fontSize: 10.5, fontWeight: '700', color: tint }} />
          <TextWidget text={r.name} style={{ fontSize: 15, fontWeight: '700', color: p.ink }} maxLines={1} truncate="END" />
        </FlexWidget>
      </FlexWidget>
      {/* Progress to the next rank: a filled and an empty bar side by side. */}
      <FlexWidget style={{ width: 'match_parent', height: 7, flexDirection: 'row', backgroundColor: p.card, borderRadius: 4 }}>
        <FlexWidget style={{ flex: Math.max(1, Math.round(r.pct)), height: 7, backgroundColor: tint, borderRadius: 4 }} />
        <FlexWidget style={{ flex: Math.max(0, 100 - Math.round(r.pct)), height: 7 }} />
      </FlexWidget>
      <TextWidget text={r.next ? `${r.need} day${r.need === 1 ? '' : 's'} won to ${r.next}` : 'Top rank'} style={{ fontSize: 11.5, color: p.ink }} maxLines={1} />
      {s && s.streak > 1 && <TextWidget text={`🔥 ${s.streak}-day streak`} style={{ fontSize: 11.5, color: p.muted }} maxLines={1} />}
    </Frame>
  );
}

// ── Steps: today's steps against the target ──
function StepsW({ s, p }: { s: Snapshot | null; p: Pal }) {
  if (!isFresh(s) || !s) return <Stale p={p} name="Steps" />;
  const pct = s.stepsTarget ? Math.min(100, Math.round((s.steps / s.stepsTarget) * 100)) : 0, hit = s.steps >= s.stepsTarget;
  return (
    <Frame p={p} uri="recomp:///" gap={3}>
      <Title t="Steps" p={p} right={hit ? '✓' : `${pct}%`} />
      <TextWidget text={n(s.steps)} style={{ fontSize: 22, fontWeight: '700', color: hit ? p.move : p.ink }} maxLines={1} />
      <TextWidget text={`of ${n(s.stepsTarget)}`} style={{ fontSize: 11, color: p.muted }} maxLines={1} />
    </Frame>
  );
}

export function renderWidget(name: string, s: Snapshot | null, timers: Record<string, Timer>, now = Date.now()) {
  const one = (p: Pal) => {
    switch (name as WidgetName) {
      case 'Timer': return <TimerW s={s} p={p} timers={timers} now={now} />;
      case 'Habits': return <HabitsW s={s} p={p} timers={timers} />;
      case 'Food': return <FoodW s={s} p={p} />;
      case 'Lift': return <LiftW s={s} p={p} />;
      case 'Level': return <LevelW s={s} p={p} />;
      default: return <StepsW s={s} p={p} />;
    }
  };
  return { light: one(LIGHT), dark: one(DARK) };
}
