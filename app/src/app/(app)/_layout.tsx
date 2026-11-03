import { Stack } from 'expo-router';
import { useTheme } from '../../lib/theme';

export default function AppStack() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.paper },
        headerTintColor: c.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.paper },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="me" options={{ title: 'Me' }} />
    </Stack>
  );
}
