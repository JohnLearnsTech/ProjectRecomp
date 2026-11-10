import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ToastHost } from '../../components/ToastHost';
import { DaysProvider, useDays } from '../../lib/days';
import { syncSteps } from '../../lib/steps';
import { RecompProvider, useRecomp } from '../../lib/recomp';
import { font, useTheme } from '../../lib/theme';

// Tapping a reminder opens what it is about (a training reminder opens the 10-minute session).
// Each response is handled once, so coming back to the app does not reopen it.
let handled: string | null = null;
function NotificationTaps() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = last.notification.request.identifier, url = last.notification.request.content.data?.url;
    if (id === handled || typeof url !== 'string' || !url.startsWith('/')) return;
    handled = id;
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    setTimeout(() => router.push(url as never), 300);
  }, [last]);
  return null;
}

// Steps from Health Connect, on open and whenever the app comes back (rev bumps on resume).
function StepSync() {
  const { engine, maxDay, rev, ready, touch } = useRecomp();
  const { entries, loaded } = useDays();
  useEffect(() => {
    if (!ready || !loaded) return;
    syncSteps(maxDay, engine.T.START, (k) => entries[k]?.steps ?? null).then((ch) => { if (ch.length) touch(); }).catch(() => {});
  }, [rev, ready, loaded, maxDay]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

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
        <Stack.Screen name="me" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="session" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="quick" options={{ presentation: 'formSheet', sheetAllowedDetents: 'fitToContents', headerShown: false, contentStyle: { backgroundColor: c.surface } }} />
      </Stack>
      <ToastHost />
      {Platform.OS !== 'web' && <NotificationTaps />}
      {Platform.OS === 'android' && <StepSync />}
      </DaysProvider>
    </RecompProvider>
  );
}
