import 'expo-sqlite/localStorage/install';
import { useMemo, useSyncExternalStore } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

// reference/design/tokens.json plus r19's palettes (Me, Settings, Colour). Multi, the default, gives
// each kind of thing its own colour (move, food, protein, train, habit, body) and each screen's
// accent follows its tab. Lime, Cobalt, Violet, Ember and Graphite use one accent everywhere.
const base = {
  light: {
    paper: '#F4F5F1', surface: '#FFFFFF', surface2: '#FAFBF6', ink: '#101210', ink2: '#3B403A', muted: '#5F665D',
    line: '#DFE1DA', lineSoft: '#ECEEE7', warn: '#B05C10', warnSoft: '#FBEBD6', danger: '#B93326', dangerSoft: '#FADCD8',
    gold: '#87680F', goldSoft: '#F8F0D2', pauseBg: '#101210', pauseInk: '#F3F5F0',
  },
  dark: {
    paper: '#08090A', surface: '#131416', surface2: '#1B1D20', ink: '#F3F5F0', ink2: '#AEB4AB', muted: '#8A9188',
    line: '#242729', lineSoft: '#1C1E20', warn: '#F0A24A', warnSoft: '#33230F', danger: '#FF7466', dangerSoft: '#3A1C19',
    gold: '#E4C468', goldSoft: '#2E2612', pauseBg: '#1F2B0D', pauseInk: '#F3F5F0',
  },
};
const multi = {
  light: { move: ['#9EDB2B', '#0B1203', '#4D7C0F'], food: ['#F59E0B', '#1F1300', '#B45309'], protein: ['#E8336E', '#FFFFFF', '#BE185D'],
    train: ['#2F6BFF', '#FFFFFF', '#1D4ED8'], habit: ['#14B8A6', '#04201C', '#0F766E'], body: ['#7C4DFF', '#FFFFFF', '#6D28D9'] },
  dark: { move: ['#C9F24C', '#0B0D06', '#C9F24C'], food: ['#FBBF24', '#1F1300', '#FBBF24'], protein: ['#FF6B9A', '#2A0612', '#FF8FB3'],
    train: ['#6B9BFF', '#071126', '#8FB2FF'], habit: ['#2DD4BF', '#04201C', '#5EEAD4'], body: ['#A88BFF', '#120A2B', '#C4B0FF'] },
} as const;
export type Category = keyof typeof multi.light;

// r19 :root[data-accent=...]: [accent, soft, ink, on, paper, surface2, line, lineSoft, pauseBg]
type Single = [string, string, string, string, string, string, string, string, string];
const DARK_GROUND = ['#08090A', '#1B1D20', '#242729', '#1C1E20'] as const;
const singles: Record<string, { light: Single; dark: Single }> = {
  lime: { light: ['#C9F24C', '#EEF9CF', '#42620A', '#0B0D06', '#F4F5F1', '#FAFBF6', '#DFE1DA', '#ECEEE7', '#101210'],
    dark: ['#C9F24C', '#1F2B0D', '#C9F24C', '#0B0D06', ...DARK_GROUND, '#1F2B0D'] },
  cobalt: { light: ['#2F6BFF', '#E6EEFF', '#1F4FCC', '#FFFFFF', '#F4F5F8', '#FAFAFC', '#DFE1E7', '#ECEEF3', '#0F1B3D'],
    dark: ['#6B9BFF', '#14213F', '#8FB2FF', '#071126', ...DARK_GROUND, '#14213F'] },
  violet: { light: ['#7C4DFF', '#EFE8FF', '#5B2FD6', '#FFFFFF', '#F5F4F8', '#FBFAFD', '#E2DFE8', '#EEECF3', '#1C1238'],
    dark: ['#A88BFF', '#221740', '#C4B0FF', '#120A2B', ...DARK_GROUND, '#221740'] },
  ember: { light: ['#FF6A2B', '#FFEDE3', '#B8430F', '#1A0C05', '#F5F4F2', '#FBFAF8', '#E3E0DB', '#EEECE8', '#2A140A'],
    dark: ['#FF7A3D', '#3A1C0E', '#FF9D6E', '#1A0C05', ...DARK_GROUND, '#3A1C0E'] },
  graphite: { light: ['#16181A', '#E9EAE6', '#16181A', '#FFFFFF', '#F4F4F3', '#FAFAF9', '#E0E0DD', '#ECECEA', '#16181A'],
    dark: ['#F3F5F0', '#2A2C2E', '#F3F5F0', '#0B0D0A', ...DARK_GROUND, '#1B1D20'] },
};
export const ACCENTS: [AccentPref, string, string[]][] = [
  ['multi', 'Multi', ['#C9F24C', '#F59E0B', '#E8336E', '#2F6BFF', '#14B8A6', '#7C4DFF']], ['lime', 'Lime', ['#C9F24C']], ['cobalt', 'Cobalt', ['#2F6BFF']],
  ['violet', 'Violet', ['#7C4DFF']], ['ember', 'Ember', ['#FF6A2B']], ['graphite', 'Graphite', ['#2A2C2E']],
];
export type AccentPref = 'multi' | 'lime' | 'cobalt' | 'violet' | 'ember' | 'graphite';
export type ThemePref = 'auto' | 'light' | 'dark';

/** CSS color-mix(in srgb, a p%, b) for two #rrggbb colours. */
export function mix(a: string, b: string, p: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('');
}

export type Cat = { fill: string; on: string; ink: string; soft: string };
function build(scheme: 'light' | 'dark', accent: AccentPref) {
  const cat = {} as Record<Category, Cat>;
  if (accent === 'multi') {
    const b = { ...base[scheme], ...(scheme === 'light' ? { paper: '#F4F4F2', surface2: '#FAFAF8', line: '#E1E1DC', lineSoft: '#EDEDE9', pauseBg: '#141618' } : { pauseBg: '#1A1C20' }) };
    (Object.keys(multi[scheme]) as Category[]).forEach((k) => {
      const [fill, on, ink] = multi[scheme][k];
      cat[k] = { fill, on, ink, soft: mix(fill, b.surface, scheme === 'dark' ? 0.22 : 0.16) };
    });
    return { ...b, cat, multi: true };
  }
  const [fill, soft, ink, on, paper, surface2, line, lineSoft, pauseBg] = singles[accent][scheme];
  const b = { ...base[scheme], paper, surface2, line, lineSoft, pauseBg };
  (Object.keys(multi.light) as Category[]).forEach((k) => { cat[k] = { fill, on, ink, soft }; });
  return { ...b, cat, multi: false };
}
export type Palette = ReturnType<typeof build>;
const cache = new Map<string, Palette>();
const paletteFor = (scheme: 'light' | 'dark', accent: AccentPref) => {
  const k = scheme + accent; if (!cache.has(k)) cache.set(k, build(scheme, accent)); return cache.get(k)!;
};

// Theme and colour preferences, kept on the phone (r19 goa:theme / goa:accent).
let prefs: { theme: ThemePref; accent: AccentPref } = { theme: 'auto', accent: 'multi' };
try {
  const t = globalThis.localStorage?.getItem('recomp:theme'); const a = globalThis.localStorage?.getItem('recomp:accent');
  if (t === 'light' || t === 'dark' || t === 'auto') prefs.theme = t;
  if (a && ACCENTS.some((x) => x[0] === a)) prefs.accent = a as AccentPref;
} catch { /* storage unavailable */ }
const subs = new Set<() => void>();
export const getPrefs = () => prefs;
export function setPrefs(p: Partial<typeof prefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem('recomp:theme', prefs.theme); localStorage.setItem('recomp:accent', prefs.accent); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
export const usePrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getPrefs, getPrefs);

export const font = { regular: 'Jost_400Regular', medium: 'Jost_500Medium', semibold: 'Jost_600SemiBold', bold: 'Jost_700Bold' };

const makeStyles = (c: Palette, accent: Cat) =>
  StyleSheet.create({
    screen: { flexGrow: 1, backgroundColor: c.paper, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120, gap: 14 },
    title: { color: c.ink, fontSize: 32, fontFamily: font.bold },
    cardTitle: { color: c.ink, fontSize: 23, fontFamily: font.bold },
    section: { color: c.ink, fontSize: 19, fontFamily: font.semibold },
    stat: { color: c.ink, fontSize: 23, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
    row16: { color: c.ink, fontSize: 16, fontFamily: font.regular },
    body: { color: c.ink, fontSize: 15, fontFamily: font.regular },
    body2: { color: c.ink2, fontSize: 15, fontFamily: font.regular },
    label: { color: c.muted, fontSize: 13, fontFamily: font.regular },
    num: { fontVariant: ['tabular-nums'] },
    error: { color: c.danger, fontSize: 13, fontFamily: font.regular },
    card: { backgroundColor: c.surface, borderRadius: 16, padding: 18, gap: 12 },
    input: {
      backgroundColor: c.surface2, color: c.ink, borderColor: c.lineSoft, borderWidth: 1, borderRadius: 12, minWidth: 0,
      paddingHorizontal: 14, minHeight: 48, fontSize: 16, fontFamily: font.regular, fontVariant: ['tabular-nums'],
    },
    primary: { backgroundColor: accent.fill, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    primaryText: { color: accent.on, fontFamily: font.bold, fontSize: 16 },
    outline: { borderColor: c.line, borderWidth: 1, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    outlineText: { color: c.ink, fontSize: 15, fontFamily: font.medium },
    chip: { backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { color: c.ink2, fontSize: 13, fontFamily: font.regular },
    row: { flexDirection: 'row', gap: 10 },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: c.lineSoft },
  });

/** accentOf: which category colours this screen's one primary button (Today move, Food food, ...). */
export function useTheme(accentOf: Category = 'move') {
  const sys = useColorScheme() === 'dark' ? 'dark' : 'light';
  const p = usePrefs();
  const scheme = p.theme === 'auto' ? sys : p.theme;
  return useMemo(() => {
    const c = paletteFor(scheme, p.accent);
    const accent = c.cat[accentOf];
    return { c, accent, s: makeStyles(c, accent), dark: scheme === 'dark' };
  }, [scheme, accentOf, p.accent]);
}
