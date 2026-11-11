// Runs headless when Android asks a widget to draw (added, resized, the 30-minute refresh) or a
// widget button is tapped. Pause, resume and start change only the timer kept on the phone, so
// they work here without the app; stopping logs time to the account, so Stop opens the app.
// A timer change redraws the Timer and Habits widgets together.
import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { localKey } from '../domain/dates';
import { allTimers, pauseTimer, startTimer } from '../lib/habitTimers';
import { readSnapshot } from './snapshot';
import { renderWidget, WIDGETS } from './widgets';

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget: draw }: WidgetTaskHandlerProps) {
  const name = widgetInfo.widgetName;
  if (widgetAction === 'WIDGET_DELETED' || !(WIDGETS as readonly string[]).includes(name)) return;
  if (widgetAction === 'WIDGET_CLICK') {
    const id = typeof clickActionData?.id === 'string' ? clickActionData.id : null;
    if (!id) return;
    if (clickAction === 'TIMER_PAUSE') pauseTimer(id);
    else if (clickAction === 'TIMER_START') { const t = allTimers()[id]; startTimer(id, t?.day ?? localKey()); }
    else return;
    const other = name === 'Timer' ? 'Habits' : 'Timer';
    await requestWidgetUpdate({ widgetName: other, renderWidget: () => renderWidget(other, readSnapshot(), allTimers()) }).catch(() => {});
  }
  draw(renderWidget(name, readSnapshot(), allTimers()));
}
