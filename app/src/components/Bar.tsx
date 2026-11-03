import { View } from 'react-native';
import { useTheme } from '../lib/theme';

/** Thin progress bar. frac is clamped to 0..1. */
export function Bar({ frac, color, height = 6 }: { frac: number; color: string; height?: number }) {
  const { c } = useTheme();
  const w = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0)) * 100;
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.lineSoft, overflow: 'hidden' }} accessibilityRole="progressbar">
      <View style={{ width: `${w}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}
