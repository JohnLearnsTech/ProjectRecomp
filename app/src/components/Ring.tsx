import Svg, { Circle } from 'react-native-svg';

/** Progress ring (r19 goal ring: r=44 in a 100 box). pct 0..100. */
export function Ring({ pct, size, color, track, width = 10 }: { pct: number; size: number; color: string; track: string; width?: number }) {
  const r = 44, circ = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={r} stroke={track} strokeWidth={width} fill="none" />
      <Circle cx={50} cy={50} r={r} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - p / 100)} transform="rotate(-90 50 50)" />
    </Svg>
  );
}
