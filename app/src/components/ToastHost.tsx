import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dismissToast, useToast } from '../lib/toast';
import { font, useTheme } from '../lib/theme';

/** Shows the current toast above the tab bar; Undo runs the undo and closes it. */
export function ToastHost() {
  const t = useToast();
  const { c } = useTheme('move');
  const insets = useSafeAreaInsets();
  if (!t) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96, alignItems: 'center' }}>
      <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.ink, borderRadius: 999, paddingLeft: 18, paddingRight: t.undo ? 6 : 18, minHeight: 46, maxWidth: 520 }}>
        <Text style={{ color: c.paper, fontFamily: font.semibold, fontSize: 14, flexShrink: 1 }} numberOfLines={2}>{t.text}</Text>
        {t.undo && (
          <Pressable onPress={() => { const u = t.undo!; dismissToast(); Promise.resolve(u()).catch(() => {}); }} accessibilityLabel={t.label ?? "Undo"}
            style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.cat.move.fill, justifyContent: 'center' }}>
            <Text style={{ color: c.cat.move.on, fontFamily: font.bold, fontSize: 14 }}>{t.label ?? 'Undo'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
