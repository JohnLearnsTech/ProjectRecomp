import type { BottomTabBarProps } from 'expo-router/tabs';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, useTheme, type Category } from '../lib/theme';
import { useDays } from '../lib/days';
import { useRecomp } from '../lib/recomp';
import { Icon } from './Icon';

const TABS: Record<string, { label: string; cat: Category; icon: string }> = {
  index: { label: 'Today', cat: 'move', icon: 'nav-home' }, food: { label: 'Food', cat: 'food', icon: 'nav-food' }, train: { label: 'Train', cat: 'train', icon: 'nav-workout' }, progress: { label: 'Progress', cat: 'body', icon: 'nav-progress' },
};

/** Floating bar: Today, Food, the black +, Train, Progress. Active tab wears its screen's soft tint. */
export function BottomBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { engine, maxDay } = useRecomp();
  const { entries, habits } = useDays();
  // r19 renderNavBadges: a dot when today still has food, a lift or a build habit to do.
  const e = entries[maxDay] ?? {}, pl = engine.plan(maxDay);
  const due: Record<string, boolean> = {
    food: pl.inRange && !(e.kcal && +e.kcal > 0),
    train: pl.inRange && pl.type === 'lift' && !(e.sets && Object.values(e.sets).some((a) => a.some((x) => x && (x.w != null || x.r != null || x.b != null)))),
    index: pl.inRange && habits.some((h) => { const v = e.habits?.[h.id]; return h.type === 'build' && !(v != null && v >= h.goal); }),
  };
  const routes = state.routes.filter((r) => TABS[r.name]);
  const tab = (r: (typeof routes)[number]) => {
    const t = TABS[r.name], active = state.routes[state.index]?.key === r.key;
    return (
      <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => navigateToTab(r.key)}
        accessibilityLabel={t.label}
        style={{ flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: active ? c.cat[t.cat].soft : 'transparent' }}>
        <View>
          <Icon name={t.icon} size={19} stroke={1.9} color={active ? c.cat[t.cat].ink : c.ink2} />
          {due[r.name] && <View style={{ position: 'absolute', top: -2, right: -4, width: 6, height: 6, borderRadius: 3, backgroundColor: c.warn }} />}
        </View>
        <Text style={{ fontFamily: font.semibold, fontSize: 11.5, color: active ? c.cat[t.cat].ink : c.ink2 }}>{t.label}</Text>
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
          <Icon name="plus" size={22} stroke={2.4} color={c.paper} />
        </Pressable>
        {routes.slice(2).map(tab)}
      </View>
    </View>
  );
}
