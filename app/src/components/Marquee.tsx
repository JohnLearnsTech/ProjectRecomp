// One line of text that scrolls sideways when it's longer than its space, like a ticker: a
// pause, a slow scroll to the end, a pause, then back. Short text stays still. With reduced
// motion turned on, long text wraps onto two lines instead.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Text, View, type StyleProp, type TextStyle } from 'react-native';

export function Marquee({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const [still, setStill] = useState(false);
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {}); }, []);
  const over = boxW > 0 ? textW - boxW : 0;
  useEffect(() => {
    x.setValue(0);
    if (still || over <= 2) return;
    const dist = over + 12;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(1400),
      Animated.timing(x, { toValue: -dist, duration: Math.max(2200, dist * 45), easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(x, { toValue: 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [over, still, text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (still) return <Text style={[style, { flexShrink: 1 }]} numberOfLines={2}>{text}</Text>;
  return (
    <View style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} accessible accessibilityLabel={text}>
      {/* A wide strip so the text lays out at its full width, then slides inside the box. */}
      <Animated.View style={{ width: 4000, flexDirection: 'row', transform: [{ translateX: x }] }}>
        <Text style={style} onLayout={(e) => setTextW(e.nativeEvent.layout.width)}>{text}</Text>
      </Animated.View>
    </View>
  );
}
