import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

// reference/design/tokens.json (lime set). Multi palette and the switcher come later.
export const palettes = {
  light: {
    paper: '#F4F5F1', surface: '#FFFFFF', surface2: '#FAFBF6', ink: '#101210', ink2: '#3B403A', muted: '#5F665D',
    line: '#DFE1DA', lineSoft: '#ECEEE7', accent: '#C9F24C', accentSoft: '#EEF9CF', accentInk: '#42620A', onAccent: '#0B0D06',
    warn: '#B05C10', warnSoft: '#FBEBD6', danger: '#B93326', dangerSoft: '#FADCD8',
  },
  dark: {
    paper: '#08090A', surface: '#131416', surface2: '#1B1D20', ink: '#F3F5F0', ink2: '#AEB4AB', muted: '#8A9188',
    line: '#242729', lineSoft: '#1C1E20', accent: '#C9F24C', accentSoft: '#1F2B0D', accentInk: '#C9F24C', onAccent: '#0B0D06',
    warn: '#F0A24A', warnSoft: '#33230F', danger: '#FF7466', dangerSoft: '#3A1C19',
  },
};
export type Palette = typeof palettes.light;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flexGrow: 1, backgroundColor: c.paper, paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
    title: { color: c.ink, fontSize: 32, fontWeight: '700' },
    cardTitle: { color: c.ink, fontSize: 23, fontWeight: '700' },
    section: { color: c.ink, fontSize: 19, fontWeight: '600' },
    body: { color: c.ink, fontSize: 15 },
    body2: { color: c.ink2, fontSize: 15 },
    label: { color: c.muted, fontSize: 13 },
    error: { color: c.danger, fontSize: 13 },
    card: { backgroundColor: c.surface, borderRadius: 16, padding: 18, gap: 12 },
    input: {
      backgroundColor: c.surface2, color: c.ink, borderColor: c.lineSoft, borderWidth: 1, borderRadius: 12,
      paddingHorizontal: 14, minHeight: 48, fontSize: 16, fontVariant: ['tabular-nums'],
    },
    primary: { backgroundColor: c.accent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontWeight: '700', fontSize: 16 },
    outline: { borderColor: c.line, borderWidth: 1, borderRadius: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    outlineText: { color: c.ink, fontSize: 15, fontWeight: '500' },
    row: { flexDirection: 'row', gap: 10 },
    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: c.lineSoft },
  });

export function useTheme() {
  const scheme = useColorScheme();
  return useMemo(() => {
    const c = scheme === 'dark' ? palettes.dark : palettes.light;
    return { c, s: makeStyles(c), dark: scheme === 'dark' };
  }, [scheme]);
}
