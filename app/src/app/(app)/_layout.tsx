import { Stack } from 'expo-router';
import { DaysProvider } from '../../lib/days';
import { RecompProvider } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';

export default function AppStack() {
  const { c } = useTheme();
  return (
    <RecompProvider>
      <DaysProvider>
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
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="session" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="quick" options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', headerShown: false, contentStyle: { backgroundColor: c.surface } }} />
      </Stack>
      </DaysProvider>
    </RecompProvider>
  );
}
