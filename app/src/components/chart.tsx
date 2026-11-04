// r19's chart drawing (renderChart, renderKcalChart, renderVolume), shared: the axis fit, the
// "nice" y step, the date ticks and thinTicks, pointValueLabels and the bold endpoint label.
import type { ReactElement } from 'react';
import { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { addDays, d, shortDate } from '../domain/dates';
import { font, type Palette } from '../lib/theme';

export type Frame = { W: number; H: number; mL: number; mR: number; mT: number; mB: number; iw: number; ih: number; i0: number; i1: number; yMin: number; yMax: number;
  X: (i: number) => number; Y: (v: number) => number };

/** Size from the card width like r19 (250 px tall under 520 px wide, narrower margins under 430). */
export function frame(width: number, i0: number, i1: number, yMin: number, yMax: number, mL0 = 48, narrowL = 38): Frame {
  const W = Math.round(width), H = W < 520 ? 250 : 300;
  const mL = W < 430 ? narrowL : mL0, mR = W < 430 ? 16 : 22, mT = 14, mB = 30;
  const iw = W - mL - mR, ih = H - mT - mB, span = Math.max(1, i1 - i0);
  return { W, H, mL, mR, mT, mB, iw, ih, i0, i1, yMin, yMax, X: (i) => mL + ((i - i0) / span) * iw, Y: (v) => mT + ih - ((v - yMin) / (yMax - yMin)) * ih };
}

const fontProps = { fontFamily: font.regular, fontSize: 11 };

/** Horizontal grid and y labels on a 1 / 2 / 2.5 / 5 / 10 step. */
export function yGrid(f: Frame, c: Palette, fmt: (v: number, dec: number) => string) {
  const raw = (f.yMax - f.yMin) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? mag * 10;
  if (!(step > 0)) step = 1;
  const dec = step < 1 ? 1 : 0, out: ReactElement[] = [];
  for (let v = Math.ceil(f.yMin / step) * step; v <= f.yMax; v += step) {
    out.push(<Line key={'gl' + v} x1={f.mL} y1={f.Y(v)} x2={f.W - f.mR} y2={f.Y(v)} stroke={c.lineSoft} strokeWidth={1} />);
    out.push(<SvgText key={'gt' + v} x={f.mL - 8} y={f.Y(v) + 4} textAnchor="end" fill={c.muted} {...fontProps}>{fmt(v, dec)}</SvgText>);
  }
  return out;
}

/** Date ticks: daily under 10 days, weekly under 46, month starts beyond; then thinTicks. */
export function xTicks(f: Frame, c: Palette, START: string, idxToLabel?: (i: number) => string) {
  const { i0, i1, W } = f, span = Math.max(1, i1 - i0);
  const lab = idxToLabel ?? ((i: number) => shortDate(addDays(d(START), i)));
  let t: [number, string][] = [];
  if (span <= 9) { const every = W < 430 ? 2 : 1; for (let i = i0; i <= i1; i += every) t.push([i, lab(i)]); if (i1 - t[t.length - 1][0] >= every) t.push([i1, lab(i1)]); }
  else if (span <= 45) { for (let i = i0; i <= i1; i += 7) t.push([i, lab(i)]); if (i1 - t[t.length - 1][0] >= 3) t.push([i1, lab(i1)]); }
  else for (let i = i0; i <= i1; i++) { const dt = addDays(d(START), i); if (i === i0 || dt.getUTCDate() === 1) t.push([i, shortDate(dt).slice(3)]); }
  // thinTicks: drop labels that would touch the next one; the end label needs more room.
  if (t.length >= 2) { const keep = [t[t.length - 1]]; for (let k = t.length - 2; k >= 0; k--) { const nxt = keep[0], need = nxt[0] === i1 ? 66 : 48; if (f.X(nxt[0]) - f.X(t[k][0]) >= need) keep.unshift(t[k]); } t = keep; }
  return t.flatMap(([i, l]) => [
    <Line key={'xl' + i} x1={f.X(i)} y1={f.mT} x2={f.X(i)} y2={f.mT + f.ih} stroke={c.lineSoft} strokeWidth={1} />,
    <SvgText key={'xt' + i} x={f.X(i)} y={f.H - 9} textAnchor={i === i0 ? 'start' : i === i1 ? 'end' : 'middle'} fill={c.muted} {...fontProps}>{l}</SvgText>,
  ]);
}

export const poly = (pts: [number, number][]) => pts.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ');

/** r19 pointValueLabels: alternate above and below, skip any label that would touch another. */
export function valueLabels(list: { x: number; y: number; v: number }[], f: Frame, minGap: number, fmt: (v: number) => string, c: Palette, endPt?: { x: number; y: number; v: number }) {
  const out: ReactElement[] = [], boxes: { l: number; r: number; t: number; b: number }[] = [];
  let lastA = -1e9, lastB = -1e9, wantA = true;
  if (endPt) { const ew = (String(fmt(endPt.v)).length * 7) / 2 + 6; boxes.push({ l: endPt.x - ew - 6, r: endPt.x + ew, t: endPt.y - 15, b: endPt.y + 15 }); }
  const fits = (bx: (typeof boxes)[0]) => boxes.every((o) => !(bx.l < o.r + 2 && bx.r > o.l - 2 && bx.t < o.b && bx.b > o.t));
  list.forEach((pt, i) => {
    const txt = String(fmt(pt.v)), w = txt.length * 6.2 + 4;
    const topRoom = pt.y > f.mT + 16, botRoom = pt.y < f.mT + f.ih - 14;
    const boxAt = (up: boolean) => { const ty = up ? pt.y - 9 : pt.y + 15; return { l: pt.x - w / 2, r: pt.x + w / 2, t: ty - 9, b: ty + 2 }; };
    const okA = topRoom && pt.x - lastA >= minGap && fits(boxAt(true)), okB = botRoom && pt.x - lastB >= minGap && fits(boxAt(false));
    let above: boolean;
    if (wantA && okA) above = true; else if (!wantA && okB) above = false; else if (okA) above = true; else if (okB) above = false; else return;
    boxes.push(boxAt(above)); if (above) lastA = pt.x; else lastB = pt.x; wantA = !above;
    out.push(<Halo key={'vl' + i} x={pt.x} y={above ? pt.y - 9 : pt.y + 15} fill={c.ink2} halo={c.surface} size={10} w={3} family={font.semibold} text={txt} />);
  });
  return out;
}

/** The last point: a bigger dot with a surface ring and its value in bold accent ink. */
export function endPoint(f: Frame, c: Palette, p: { x: number; y: number; v: number }, txt: string, color: string, ink: string, ty?: number) {
  const half = (txt.length * 7 + 6) / 2, x = Math.max(f.mL + half, Math.min(p.x, f.W - 2 - half));
  const y = ty ?? (p.y > f.mT + 18 ? p.y - 9 : p.y + 16);
  return (
    <G key="end">
      <Circle cx={p.x} cy={p.y} r={4.5} fill={color} stroke={c.surface} strokeWidth={2} />
      <Halo x={x} y={y} fill={ink} halo={c.surface} size={12} w={3.5} family={font.bold} text={txt} />
    </G>
  );
}

/** Text with a surface-coloured outline behind it (r19 paint-order: stroke), so it reads over lines. */
export function Halo({ x, y, fill, halo, size, w, family, text, anchor = 'middle' }: { x: number; y: number; fill: string; halo: string; size: number; w: number; family: string; text: string; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <G>
      <SvgText x={x} y={y} textAnchor={anchor} fill={halo} stroke={halo} strokeWidth={w} strokeLinejoin="round" fontSize={size} fontFamily={family}>{text}</SvgText>
      <SvgText x={x} y={y} textAnchor={anchor} fill={fill} fontSize={size} fontFamily={family}>{text}</SvgText>
    </G>
  );
}

export { Circle, Polyline };
