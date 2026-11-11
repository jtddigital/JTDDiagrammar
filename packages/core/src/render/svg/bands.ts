import type { Box, PlacedBand } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { BAND_FONT } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { dash, type Palette } from './theme.ts';

const rect = (b: Box, fill: string, stroke: string, extra = '') =>
  `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${fill}" stroke="${stroke}" stroke-width="1"${extra}/>`;

const label = (b: PlacedBand) =>
  lines(
    b.lines,
    b.header.x + b.header.w / 2,
    b.header.y + (b.header.h - b.lines.length * lineHeight(BAND_FONT)) / 2,
    BAND_FONT,
    ` font-size="${BAND_FONT.size}" font-weight="bold"${b.style?.text ? ` fill="${b.style.text}"` : ''}`,
  );

const group = (b: PlacedBand, body: string) => `<g id="${b.kind[0]}-${esc(b.id)}" class="jtd-${b.kind}">${body}</g>`;

/** Lane rows and phase columns with header cells, beneath edges and nodes (URS-RN-002). `style.fill` colours the header. */
export function bands(bs: readonly PlacedBand[], P: Palette, corner?: Box): string {
  const stroke = (b: PlacedBand) => b.style?.stroke ?? P.bandStroke;
  const lanes = bs
    .filter((b) => b.kind === 'lane')
    .map((b) => group(b, rect(b, P.laneFill, stroke(b), dash(b.style?.dash)) + rect(b.header, b.style?.fill ?? P.laneHeaderFill, stroke(b)) + label(b)));
  const phases = bs
    .filter((b) => b.kind === 'phase')
    .map((b) => group(b, rect(b, 'none', stroke(b), dash(b.style?.dash)) + rect(b.header, b.style?.fill ?? P.phaseHeaderFill, stroke(b)) + label(b)));
  return lanes.join('') + phases.join('') + (corner ? rect(corner, P.phaseHeaderFill, P.bandStroke) : '');
}
