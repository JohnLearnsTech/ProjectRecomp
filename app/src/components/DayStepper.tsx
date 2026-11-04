import { Pressable, Text, View } from 'react-native';
import { addKey, d, fmt } from '../domain/dates';
import { useRecomp } from '../lib/recomp';
import { font, useTheme } from '../lib/theme';

/** Day picker for screens without the week strip (r19's ‹ date › on Train). */
export function DayStepper() {
  const { engine, day, setDay, maxDay } = useRecomp();
  const { c, s } = useTheme();
  const { START, END } = engine.T;
  const Btn = ({ label, to, glyph, disabled }: { label: string; to: string; glyph: string; disabled: boolean }) => (
    <Pressable onPress={() => setDay(to)} disabled={disabled} accessibilityLabel={label} hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, opacity: disabled ? 0.35 : 1 }}>
      <Text style={{ fontSize: 22, color: c.ink, fontFamily: font.regular }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Btn label="Previous day" glyph="‹" to={addKey(day, -1)} disabled={day <= START} />
      <Text style={[s.body, { flex: 1, textAlign: 'center', fontFamily: font.semibold }]}>{fmt(d(day))}</Text>
      <Btn label="Next day" glyph="›" to={addKey(day, 1)} disabled={day >= END} />
      {day !== maxDay && (
        <Pressable onPress={() => setDay(maxDay)} style={[s.outline, { minHeight: 40 }]}><Text style={s.outlineText}>Today</Text></Pressable>
      )}
    </View>
  );
}
