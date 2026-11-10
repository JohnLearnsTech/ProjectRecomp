// The "Today" home screen widget: calories and protein left, walk steps, and the lift day, with
// one-tap buttons into Food and the 10-minute session. Pure: draws a snapshot.
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { isFresh, type Snapshot } from './snapshot';

type Hex = `#${string}`;
type Pal = Record<'bg' | 'card' | 'ink' | 'muted' | 'food' | 'protein' | 'move' | 'train' | 'btn' | 'btnInk', Hex>;
const DARK: Pal = { bg: '#141614', card: '#1F221F', ink: '#F2F4F0', muted: '#9AA29A', food: '#F5B82E', protein: '#7FB2FF', move: '#9BE15D', train: '#FF8A5B', btn: '#F2F4F0', btnInk: '#141614' };
const LIGHT: Pal = { bg: '#FBFBF8', card: '#EFF1EC', ink: '#161816', muted: '#646B64', food: '#B57D00', protein: '#2F6FD6', move: '#3F8F1F', train: '#C9531E', btn: '#161816', btnInk: '#FBFBF8' };

const n = (x: number) => Math.round(x).toLocaleString('en-IN');

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

function Body({ s, p }: { s: Snapshot | null; p: Pal }) {
  if (!isFresh(s) || !s) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget text="Project Recomp" style={{ fontSize: 15, fontWeight: '700', color: p.ink }} />
        <TextWidget text="Open the app to load today." style={{ fontSize: 12.5, color: p.muted }} />
      </FlexWidget>
    );
  }
  const kOver = s.kcalLeft < 0;
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
export function todayWidget(s: Snapshot | null) {
  return { light: <Body s={s} p={LIGHT} />, dark: <Body s={s} p={DARK} /> };
}
