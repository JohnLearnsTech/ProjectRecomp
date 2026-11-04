import { useEffect, useRef, type ComponentRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { font, useTheme } from '../lib/theme';

const ITEM = 44; // r19 .wheel .wn height; three rows show (132 px), the middle one is picked

/** r19's spin wheel: one column of values that snaps to the middle row. No keyboard. */
export function Wheel({ values, value, onChange, format, label, color }: {
  values: number[]; value: number; onChange: (v: number) => void; format: (v: number) => string; label?: string; color: string;
}) {
  const { c } = useTheme();
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const idx = Math.max(0, values.findIndex((v) => Math.abs(v - value) < 1e-6));
  const cur = useRef(idx);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (cur.current !== idx) { cur.current = idx; ref.current?.scrollTo({ y: idx * ITEM, animated: false }); } }, [idx]);
  const settle = (y: number) => {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(y / ITEM)));
    ref.current?.scrollTo({ y: i * ITEM, animated: true });
    if (i !== cur.current) { cur.current = i; onChange(values[i]); }
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Web has no momentum-end event; settle once the scrolling stops.
    if (Platform.OS !== 'web') return;
    const y = e.nativeEvent.contentOffset.y;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => settle(y), 120);
  };
  return (
    <View style={{ flex: 1, maxWidth: 120, alignItems: 'center' }}>
      <View style={{ height: ITEM * 3, width: '100%' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: ITEM, height: ITEM, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }} />
        <ScrollView ref={ref} showsVerticalScrollIndicator={false} snapToInterval={ITEM} decelerationRate="fast" scrollEventThrottle={16}
          contentContainerStyle={{ paddingVertical: ITEM }} contentOffset={{ x: 0, y: idx * ITEM }} nestedScrollEnabled
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
          onScrollEndDrag={(e) => { if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) settle(e.nativeEvent.contentOffset.y); }}
          onScroll={onScroll} accessibilityLabel={label}
          onLayout={() => ref.current?.scrollTo({ y: cur.current * ITEM, animated: false })}>
          {values.map((v, i) => {
            const sel = i === idx;
            return (
              <Pressable key={i} onPress={() => { cur.current = i; ref.current?.scrollTo({ y: i * ITEM, animated: true }); onChange(v); }} style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: sel ? font.bold : font.semibold, fontSize: sel ? 24 : 20, color: sel ? color : c.muted, fontVariant: ['tabular-nums'] }}>{format(v)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {!!label && <Text style={{ fontFamily: font.bold, fontSize: 10, color: c.muted, marginTop: 2 }}>{label}</Text>}
    </View>
  );
}

export const range = (mn: number, mx: number, st: number) => { const out: number[] = []; for (let n = mn; n <= mx + 1e-9; n += st) out.push(+n.toFixed(4)); return out; };
