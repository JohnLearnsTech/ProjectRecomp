import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

// reference/design/tokens.json plus r19's Multi palette (the default): each kind of thing has
// its own colour (move, food, protein, train, habit, body) and each screen's accent follows
// its tab. Lime, Cobalt and the other palettes come with Settings.
const base = {
  light: {
    paper: '#F4F5F1', surface: '#FFFFFF', surface2: '#FAFBF6', ink: '#101210', ink2: '#3B403A', muted: '#5F665D',
    line: '#DFE1DA', lineSoft: '#ECEEE7', warn: '#B05C10', warnSoft: '#FBEBD6', danger: '#B93326', dangerSoft: '#FADCD8',
    pauseBg: '#101210', pauseInk: '#F3F5F0',
  },
  dark: {
    paper: '#08090A', surface: '#131416', surface2: '#1B1D20', ink: '#F3F5F0', ink2: '#AEB4AB', muted: '#8A9188',
    line: '#242729', lineSoft: '#1C1E20', warn: '#F0A24A', warnSoft: '#33230F', danger: '#FF7466', dangerSoft: '#3A1C19',
    pauseBg: '#1F2B0D', pauseInk: '#F3F5F0',
  },
};
const multi = {
  light: { move: ['#9EDB2B', '#0B1203', '#4D7C0F'], food: ['#F59E0B', '#1F1300', '#B45309'], protein: ['#E8336E', '#FFFFFF', '#BE185D'],
    train: ['#2F6BFF', '#FFFFFF', '#1D4ED8'], habit: ['#14B8A6', '#04201C', '#0F766E'], body: ['#7C4DFF', '#FFFFFF', '#6D28D9'] },
  dark: { move: ['#C9F24C', '#0B0D06', '#C9F24C'], food: ['#FBBF24', '#1F1300', '#FBBF24'], protein: ['#FF6B9A', '#2A0612', '#FF8FB3'],
    train: ['#6B9BFF', '#071126', '#8FB2FF'], habit: ['#2DD4BF', '#04201C', '#5EEAD4'], body: ['#A88BFF', '#120A2B', '#C4B0FF'] },
} as const;
export type Category = keyof typeof multi.light;

/** CSS color-mix(in srgb, a p%, b) for two #rrggbb colours. */
function mix(a: string, b: string, p: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, '0')).join('');
}

export type Cat = { fill: string; on: string; ink: string; soft: string };
function build(scheme: 'light' | 'dark') {
  const b = base[scheme];
  const cat = {} as Record<Category, Cat>;
  (Object.keys(multi[scheme]) as Category[]).forEach((k) => {
    const [fill, on, ink] = multi[scheme][k];
    cat[k] = { fill, on, ink, soft: mix(fill, b.surface, scheme === 'dark' ? 0.22 : 0.16) };
  });
  return { ...b, cat };
}
export type Palette = ReturnType<typeof build>;
const palettes = { light: build('light'), dark: build('dark') };

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
      backgroundColor: c.surface2, color: c.ink, borderColor: c.lineSoft, borderWidth: 1, borderRadius: 12,
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
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => {
    const c = palettes[scheme];
    const accent = c.cat[accentOf];
    return { c, accent, s: makeStyles(c, accent), dark: scheme === 'dark' };
  }, [scheme, accentOf]);
}
