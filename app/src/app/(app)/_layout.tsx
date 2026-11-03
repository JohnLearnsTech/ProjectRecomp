import { Stack } from 'expo-router';
import { RecompProvider } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';

export default function AppStack() {
  const { c } = useTheme();
  return (
    <RecompProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.paper },
          headerTintColor: c.ink,
          headerTitleStyle: { fontFamily: font.semibold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.paper },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="me" options={{ title: 'Me' }} />
        <Stack.Screen name="quick" options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', headerShown: false, contentStyle: { backgroundColor: c.surface } }} />
      </Stack>
    </RecompProvider>
  );
}
