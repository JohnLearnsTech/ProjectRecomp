import { SvgXml } from 'react-native-svg';

// r19's inline icons (function ic and the tab bar's ICON), drawn the same way: 24 px grid,
// round stroke in the current colour. Copied verbatim from reference/app/recomp.html.
const P: Record<string, string> = {
 "pomo": "<circle cx=\"12\" cy=\"13\" r=\"8\"/><path d=\"M12 9v4l2 2M9 2h6\"/>",
 "edit": "<path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/>",
 "trash": "<path d=\"M3 6h18\"/><path d=\"M8 6V4h8v2\"/><path d=\"M19 6l-1 14H6L5 6\"/><path d=\"M10 11v6M14 11v6\"/>",
 "play": "<path d=\"M8 5v14l11-7z\" fill=\"currentColor\" stroke=\"none\"/>",
 "pause": "<rect x=\"6\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"14\" y=\"5\" width=\"4\" height=\"14\" rx=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
 "stop": "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\" fill=\"currentColor\" stroke=\"none\"/>",
 "reset": "<path d=\"M3 12a9 9 0 1 0 3-6.7L3 8\"/><path d=\"M3 3v5h5\"/>",
 "down": "<path d=\"M6 9l6 6 6-6\"/>",
 "up": "<path d=\"M18 15l-6-6-6 6\"/>",
 "plus": "<path d=\"M12 5v14M5 12h14\"/>",
 "camera": "<path d=\"M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/>",
 "check": "<path d=\"M20 6L9 17l-5-5\"/>",
 "alert": "<path d=\"M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z\"/>",
 "swap": "<path d=\"M7 7h11l-3-3\"/><path d=\"M17 17H6l3 3\"/>",
 "shuffle": "<path d=\"M16 3h5v5\"/><path d=\"M4 20L21 3\"/><path d=\"M21 16v5h-5\"/><path d=\"M15 15l6 6\"/><path d=\"M4 4l5 5\"/>",
 "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
 "moon": "<path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z\"/>",
 "auto": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 3a9 9 0 0 1 0 18z\" fill=\"currentColor\" stroke=\"none\"/>",
 "expand": "<path d=\"M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3\"/>",
 "minimize": "<path d=\"M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M21 16h-3a2 2 0 0 0-2 2v3M3 16h3a2 2 0 0 1 2 2v3\"/>",
 "me": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7\"/>",
 "star": "<path d=\"M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z\"/>",
 "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
 "nav-home": "<path d=\"M4 11 12 4l8 7M6 10v9h12v-9\"/>",
 "nav-food": "<path d=\"M7 4v7a3 3 0 0 0 6 0V4M10 11v9M17 4c-1.5 2-2 4-2 6h4c0-2-.5-4-2-6zM17 10v10\"/>",
 "nav-workout": "<path d=\"M5 9v6M19 9v6M8 7v10M16 7v10M8 12h8\"/>",
 "nav-progress": "<path d=\"M4 19V5M4 19h16M8 14l3-4 3 2 5-7\"/>"
};
export type IconName = keyof typeof P;

export function Icon({ name, size = 16, color, stroke = 2 }: { name: string; size?: number; color: string; stroke?: number }) {
  const xml = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${(P[name] || '').replace(/currentColor/g, color)}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}
