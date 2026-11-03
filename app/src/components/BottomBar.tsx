import type { BottomTabBarProps } from 'expo-router/tabs';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, useTheme, type Category } from '../lib/theme';

const TABS: Record<string, { label: string; cat: Category }> = {
  index: { label: 'Today', cat: 'move' }, food: { label: 'Food', cat: 'food' }, train: { label: 'Train', cat: 'train' }, progress: { label: 'Progress', cat: 'body' },
};

/** Floating bar: Today, Food, the black +, Train, Progress. Active tab wears its screen's soft tint. */
export function BottomBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => TABS[r.name]);
  const tab = (r: (typeof routes)[number]) => {
    const t = TABS[r.name], active = state.routes[state.index]?.key === r.key;
    return (
      <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => navigateToTab(r.key)}
        style={{ flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.cat[t.cat].soft : 'transparent' }}>
        <Text style={{ fontFamily: active ? font.semibold : font.medium, fontSize: 13, color: active ? c.cat[t.cat].ink : c.ink2 }}>{t.label}</Text>
      </Pressable>
    );
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 12 }}>
      <View style={{ height: 68, borderRadius: 22, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4,
        borderWidth: 1, borderColor: c.lineSoft, elevation: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }}>
        {routes.slice(0, 2).map(tab)}
        <Pressable accessibilityLabel="Quick log" onPress={() => router.push('/quick')}
          style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.paper, fontSize: 30, lineHeight: 34, fontFamily: font.regular }}>+</Text>
        </Pressable>
        {routes.slice(2).map(tab)}
      </View>
    </View>
  );
}
