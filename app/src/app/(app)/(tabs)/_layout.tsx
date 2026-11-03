import { Tabs } from 'expo-router';
import { BottomBar } from '../../../components/BottomBar';
import { useTheme } from '../../../lib/theme';

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs tabBar={(p) => <BottomBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.paper } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="food" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="progress" />
    </Tabs>
  );
}
