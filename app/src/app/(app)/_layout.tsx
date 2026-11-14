import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { ToastHost } from '../../components/ToastHost';
import { DaysProvider, useDays } from '../../lib/days';
import { syncSteps } from '../../lib/steps';
import { habitMet, isTimeUnit, tracksSteps } from '../../domain/days';
import { trimNum } from '../../domain/dates';
import { allTimers, timerMs, useTimerStore } from '../../lib/habitTimers';
import { dropWalk, pauseWalk, pushWidgets, replayWalkEvents, resumeWalk, startWalk, walkPermissions, walkState, walkSupported } from '../../lib/walk';
import { useGame } from '../../lib/game';
import { fmt12, loadCue } from '../../lib/workout';
import { writeSnapshot, type Snapshot } from '../../widgets/snapshot';
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

// Keeps the live walk tracker in step with the walk habit's timer (Android).
function WalkSync() {
  const { habits, loaded } = useDays();
  const { timers } = useTimerStore();
  const asked = useRef(false);
  const walkIds = habits.filter(tracksSteps).map((h) => h.id);
  const id = walkIds.find((k) => timers[k]) ?? null;
  const key = id ? `${id}:${timers[id]?.running ? 1 : 0}` : '-';
  useEffect(() => {
    if (!loaded) return;
    const st = walkState();
    // Discarded or stopped elsewhere: the app's Stop already took the steps (finishWalk).
    if (!id) { if (st?.active) dropWalk(); return; }
    const t = timers[id];
    if (st?.active && st.habitId === id) {
      // Notification taps first; replaying them changes the timer and brings us back here.
      if (replayWalkEvents(id)) return;
      if (t.running && !st.running) resumeWalk(); else if (!t.running && st.running) pauseWalk();
      return;
    }
    if (!t.running) return;
    const h = habits.find((x) => x.id === id)!;
    (async () => {
      if (!asked.current) { asked.current = true; await walkPermissions(); }
      startWalk(id, h.name, timerMs(id));
    })();
  }, [key, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Coming back to the app: replay what was tapped on the notification meanwhile.
  useEffect(() => {
    const replay = () => { const st = walkState(); if (st?.active) replayWalkEvents(st.habitId); };
    replay();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') replay(); });
    return () => sub.remove();
  }, []);
  return null;
}

// Keeps the home screen widget in step with today's numbers.
function WidgetSync() {
  const { engine, maxDay } = useRecomp();
  const { D, entries, habits, keystone, loaded } = useDays();
  const game = useGame();
  const { timers } = useTimerStore();
  const timersKey = Object.keys(timers).map((k) => `${k}:${timers[k]?.running ? 1 : 0}`).join(',');

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
      rank: game ? { i: game.level.i, name: game.level.name, tint: game.level.tint, motto: game.level.motto, next: game.level.next?.name ?? null, need: game.level.next?.need ?? 0,
        pct: game.level.next ? ((game.totalWon - game.level.from) / Math.max(1, game.level.next.at - game.level.from)) * 100 : 100,
        span: game.level.next ? game.level.next.at - game.level.from : 1, done: game.level.next ? game.totalWon - game.level.from : 1 } : null,
      // The keystone first, then the rest in order: four fit on the widget.
      habits: [...(keystone ? [keystone] : []), ...habits.filter((h) => h.id !== keystone?.id)].slice(0, 6).map((h) => {
        const v = D.habitVal(maxDay, h.id);
        return { id: h.id, name: h.name, timed: isTimeUnit(h.unit), met: habitMet(h, v), val: v == null ? 'not yet' : `${trimNum(v)}${h.unit ? ' ' + h.unit : ''}` };
      }),
      names: Object.fromEntries(habits.map((h) => [h.id, h.name])),
      walkIds: habits.filter(tracksSteps).map((h) => h.id),
      timer: (() => {
        const all = allTimers(), tid = Object.keys(all).find((k) => all[k]?.running) ?? Object.keys(all).find((k) => all[k]) ?? null;
        if (!tid) return null;
        const t = all[tid];
        return { id: tid, name: habits.find((h) => h.id === tid)?.name ?? 'Timer', running: !!t.running, elapsedMs: timerMs(tid), at: Date.now(), since: t.segs?.[0]?.s ?? t.startedAt };
      })(),
    };
    writeSnapshot(snap);
    pushWidgets(snap);
  }, [loaded, maxDay, entries, habits, game?.level.name, game?.streak, timersKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
      {walkSupported && <WidgetSync />}
      {walkSupported && <WalkSync />}
      </DaysProvider>
    </RecompProvider>
  );
}
