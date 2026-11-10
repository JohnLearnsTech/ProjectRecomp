import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { ToastHost } from '../../components/ToastHost';
import { DaysProvider, useDays } from '../../lib/days';
import { syncSteps } from '../../lib/steps';
import { tracksSteps } from '../../domain/days';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { useGame } from '../../lib/game';
import { fmt12, loadCue } from '../../lib/workout';
import { writeSnapshot, type Snapshot } from '../../widgets/snapshot';
import { todayWidget } from '../../widgets/TodayWidget';
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
  const { entries, habits, loaded } = useDays();
  useEffect(() => {
    if (!ready || !loaded) return;
    syncSteps({ today: maxDay, start: engine.T.START, have: (k) => entries[k]?.steps ?? null, walkIds: habits.filter(tracksSteps).map((h) => h.id) })
      .then((r) => { if (r.changed.length) touch(); }).catch(() => {});
  }, [rev, ready, loaded, maxDay]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Keeps the home screen widget in step with today's numbers.
function WidgetSync() {
  const { engine, maxDay } = useRecomp();
  const { D, entries, loaded } = useDays();
  const game = useGame();
  useEffect(() => {
    if (!loaded) return;
    const P = engine.plan(maxDay), e = entries[maxDay] ?? {}, cue = loadCue();
    const trained = D.trainedOn(maxDay), warm = !!e.checks?.warmup;
    const lift: Snapshot['lift'] = !P.inRange ? 'off' : P.type !== 'lift' ? P.type : trained ? 'done' : warm ? 'warm' : 'todo';
    const liftLine = lift === 'done' ? 'Lifted today ✓' : lift === 'warm' ? 'Warm-up done ✓' : lift === 'todo' ? (cue ? `Lift before your ${fmt12(cue.at)} ${cue.anchor}` : 'Lift day: two exercises')
      : lift === 'rest' ? 'Rest day' : lift === 'cardio' ? 'Cardio day' : '';
    const snap: Snapshot = {
      day: maxDay, kcalTarget: P.kcal, kcalLeft: Math.round(P.kcal - (+(e.kcal ?? 0))), proteinTarget: P.protein,
      proteinLeft: Math.max(0, Math.round(P.protein - (+(e.protein ?? 0)))), steps: +(e.steps ?? 0), stepsTarget: P.steps,
      lift, liftLine, level: game?.level.name ?? null, streak: game?.streak ?? 0,
    };
    writeSnapshot(snap);
    requestWidgetUpdate({ widgetName: 'Today', renderWidget: () => todayWidget(snap) }).catch(() => {});
  }, [loaded, maxDay, entries, game?.level.name, game?.streak]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {Platform.OS === 'android' && <WidgetSync />}
      </DaysProvider>
    </RecompProvider>
  );
}
