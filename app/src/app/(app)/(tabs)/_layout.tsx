import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useRecomp } from '../../../lib/recomp';
import { BottomBar } from '../../../components/BottomBar';
import { useTheme } from '../../../lib/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  const { ready, engine } = useRecomp();
  // Wait for the first load so a new user never sees the starter goal flash by.
  if (!ready) return <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}><ActivityIndicator color={c.cat.move.ink} /></View>;
  // r19 maybeOnboard(): no goal yet means setup.
  if (engine.G.provisional) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(p) => <BottomBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.paper } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="food" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="progress" />
    </Tabs>
  );
}
