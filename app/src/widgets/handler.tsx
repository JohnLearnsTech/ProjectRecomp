// Runs headless when Android asks a widget to draw (added, resized, the 30-minute refresh, or the
// live walk tracker's nudge) or a widget button is tapped. Pause, resume and start change the
// timer kept on the phone, so they work here without the app; a walk's live tracker follows.
// Stopping logs time to the account, so Stop opens the app.
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { localKey } from '../domain/dates';
import { allTimers, pauseTimer, startTimer, timerMs } from '../lib/habitTimers';
import { pauseWalk, resumeWalk, startWalk, walkState } from '../lib/walk';
import { readSnapshot } from './snapshot';
import { renderWidget, WIDGETS, type Live } from './widgets';

export const liveWalk = (): Live => { const st = walkState(); return st?.active ? { habitId: st.habitId, steps: st.steps, running: st.running } : null; };

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget: draw }: WidgetTaskHandlerProps) {
  const name = widgetInfo.widgetName;
  if (widgetAction === 'WIDGET_DELETED' || !(WIDGETS as readonly string[]).includes(name)) return;
  if (widgetAction === 'WIDGET_CLICK') {
    const id = typeof clickActionData?.id === 'string' ? clickActionData.id : null;
    if (!id) return;
    const snap = readSnapshot(), isWalk = !!snap?.walkIds?.includes(id), st = walkState();
    if (clickAction === 'TIMER_PAUSE') { pauseTimer(id); if (st?.active && st.habitId === id) pauseWalk(); }
    else if (clickAction === 'TIMER_START') {
      startTimer(id, allTimers()[id]?.day ?? localKey());
      if (isWalk) { if (st?.active && st.habitId === id) resumeWalk(); else startWalk(id, snap?.names[id] ?? 'Walk', timerMs(id)); }
    } else return;
    for (const other of ['Timer', 'Habits', 'Steps'].filter((w) => w !== name)) {
      await requestWidgetUpdate({ widgetName: other, renderWidget: () => renderWidget(other, readSnapshot(), allTimers(), liveWalk()) }).catch(() => {});
    }
  }
  draw(renderWidget(name, readSnapshot(), allTimers(), liveWalk()));
}
