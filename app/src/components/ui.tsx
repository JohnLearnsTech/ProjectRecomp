// Small building blocks that mirror r19's CSS classes, so screens read the same as the web app:
// .subtabs, .pchip, .itip, details.mob, .stats/.stat, .bar, button.mini, button.save, .cue.
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { font, useTheme, type Category } from '../lib/theme';

/** r19 .subtabs: a scrolling row of pills, the current one filled with ink. */
export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }} style={{ flexGrow: 0 }}>
      {tabs.map(([k, l]) => {
        const on = k === value;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: on ? c.ink : c.line, backgroundColor: on ? c.ink : c.surface }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: on ? c.paper : c.ink2 }}>{l}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** r19 .pchip / .rangetabs button: a pressable pill. `dot` marks the current phase. */
export function Pill({ label, on, onPress, dot, cat = 'move', small }: { label: string; on: boolean; onPress: () => void; dot?: boolean; cat?: Category; small?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ minHeight: small ? 30 : 34, paddingHorizontal: small ? 11 : 13, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderColor: on ? c.ink : c.line, backgroundColor: on ? c.ink : c.surface }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.cat[cat].fill, borderWidth: 1, borderColor: c.cat[cat].ink }} />}
      <Text style={{ fontFamily: font.bold, fontSize: small ? 11 : 12.5, color: on ? c.paper : c.ink2 }}>{label}</Text>
    </Pressable>
  );
}

/** r19 .rangetabs: a segmented control in a soft frame; the picked one takes the accent. */
export function Segmented<T extends string | number>({ items, value, onChange, cat = 'move', dark }: { items: [T, string][]; value: T; onChange: (v: T) => void; cat?: Category; dark?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: 999, borderWidth: 1, borderColor: c.lineSoft, backgroundColor: c.surface2, flexWrap: 'wrap' }}>
      {items.map(([v, l]) => {
        const on = v === value;
        return (
          <Pressable key={String(v)} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={{ minHeight: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? (dark ? c.ink : c.cat[cat].fill) : 'transparent' }}>
            <Text style={{ fontFamily: font.bold, fontSize: 11.5, color: on ? (dark ? c.paper : c.cat[cat].on) : c.muted }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** r19 .itip: the round (i) beside a title. Tapping shows the explanation under the title row. */
export function useInfo(text: string, label: string) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const button = (
    <Pressable onPress={() => setOpen((o) => !o)} accessibilityLabel={label} accessibilityState={{ expanded: open }} hitSlop={10}
      style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: open ? c.cat.move.fill : c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.semibold, fontStyle: 'italic', fontSize: 12, color: open ? c.cat.move.ink : c.muted, lineHeight: 14 }}>i</Text>
    </Pressable>
  );
  const panel = open ? (
    <View style={{ backgroundColor: c.surface2, borderWidth: 1, borderColor: c.lineSoft, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 20, color: c.ink2 }}>{text}</Text>
    </View>
  ) : null;
  return { button, panel };
}

/** A card title with an optional (i) and something on the right (r19 .panel-head). */
export function PanelHead({ title, info, right, size = 23 }: { title: string; info?: { text: string; label: string }; right?: ReactNode; size?: number }) {
  const { c } = useTheme();
  const tip = useInfo(info?.text ?? '', info?.label ?? '');
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <Text style={{ fontFamily: font.bold, fontSize: size, color: c.ink, flexShrink: 1 }} accessibilityRole="header">{title}</Text>
          {info && tip.button}
        </View>
        {right}
      </View>
      {info && tip.panel}
    </View>
  );
}

/** r19 details.mob: a soft fold-out with a + / – on the right. */
export function Fold({ title, children, initial = false, big }: { title: string; children: ReactNode; initial?: boolean; big?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(initial);
  return (
    <View style={{ borderWidth: 1, borderColor: big ? c.line : c.lineSoft, borderRadius: 12, backgroundColor: big ? c.surface : c.surface2, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: big ? 15 : 13 }}>
        <Text style={{ fontFamily: font.bold, fontSize: big ? 16 : 12.5, color: big ? c.ink : c.ink2, flexShrink: 1 }}>{title}</Text>
        {big ? <Icon name={open ? 'up' : 'down'} size={16} color={c.ink2} /> : <Text style={{ fontSize: 16, color: c.muted }}>{open ? '–' : '+'}</Text>}
      </Pressable>
      {open && <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>{children}</View>}
    </View>
  );
}

/** r19 .stats: a grid of tiles split by hairlines. */
export function Stats({ items, cols = 2 }: { items: { k: string; v: string; n?: string; tone?: string }[]; cols?: number }) {
  const { c } = useTheme();
  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: c.lineSoft, gap: 1, borderWidth: 1, borderColor: c.lineSoft }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 1 }}>
          {r.map((x) => (
            <View key={x.k} style={{ flex: 1, backgroundColor: c.surface, paddingVertical: 15, paddingHorizontal: 16, gap: 3 }}>
              <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: c.muted }}>{x.k}</Text>
              <Text style={{ fontFamily: font.bold, fontSize: 26, color: x.tone ?? c.ink, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{x.v}</Text>
              {!!x.n && <Text style={{ fontFamily: font.regular, fontSize: 11.5, color: c.muted }}>{x.n}</Text>}
            </View>
          ))}
          {r.length < cols && Array.from({ length: cols - r.length }, (_, j) => <View key={'e' + j} style={{ flex: 1, backgroundColor: c.surface }} />)}
        </View>
      ))}
    </View>
  );
}

/** r19 .bar: label, value, and a rounded track. */
export function Meter({ k, v, pct, color }: { k: string; v: string; pct: number; color?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontFamily: font.bold, fontSize: 10.5, color: c.muted }}>{k}</Text>
        <Text style={{ fontFamily: font.regular, fontSize: 12.5, color: c.ink, fontVariant: ['tabular-nums'] }}>{v}</Text>
      </View>
      <View style={{ height: 9, borderRadius: 999, backgroundColor: c.lineSoft, overflow: 'hidden' }}>
        <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, borderRadius: 999, backgroundColor: color ?? c.cat.move.fill }} />
      </View>
    </View>
  );
}

/** r19 button.mini: a small outlined pill button. */
export function Mini({ label, onPress, disabled, danger, icon, style }: { label?: string; onPress: () => void; disabled?: boolean; danger?: boolean; icon?: string; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const col = danger ? c.danger : c.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={[{ minHeight: 40, paddingHorizontal: label ? 14 : 0, width: label ? undefined : 40, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.4 : 1 }, style]}>
      {icon && <Icon name={icon} size={15} color={col} />}
      {label && <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: col }}>{label}</Text>}
    </Pressable>
  );
}

/** r19 .cue: small muted help text. */
export function Cue({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 19, color: c.muted }}>{children}</Text>;
}

/** A labelled field (r19 .field label). */
export function Label({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink2 }}>{children}</Text>;
}
