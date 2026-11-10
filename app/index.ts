// The app's entry: Expo Router, plus the Android home screen widget's background handler.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/handler') as typeof import('./src/widgets/handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
