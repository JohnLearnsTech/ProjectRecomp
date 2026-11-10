// Runs headless when Android asks a widget to draw (added, resized, or the 30-minute refresh).
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readSnapshot } from './snapshot';
import { todayWidget } from './TodayWidget';

export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  if (widgetInfo.widgetName === 'Today') renderWidget(todayWidget(readSnapshot()));
}
