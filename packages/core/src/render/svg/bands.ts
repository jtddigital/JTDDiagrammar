import type { Box, PlacedBand } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { BAND_FONT } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { THEME as T } from './theme.ts';

const rect = (b: Box, fill: string) =>
  `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${fill}" stroke="${T.bandStroke}" stroke-width="1"/>`;

const label = (b: PlacedBand) =>
  lines(b.lines, b.header.x + b.header.w / 2, b.header.y + (b.header.h - b.lines.length * lineHeight(BAND_FONT)) / 2, BAND_FONT, ` font-size="${BAND_FONT.size}" font-weight="bold"`);

const group = (b: PlacedBand, body: string) => `<g id="${b.kind[0]}-${esc(b.id)}" class="jtd-${b.kind}" data-id="${esc(b.id)}">${body}</g>`;

/** Lane rows and phase columns with header cells, drawn beneath edges and nodes (URS-RN-002). */
export function bands(bs: readonly PlacedBand[], corner?: Box): string {
  const lanes = bs.filter((b) => b.kind === 'lane').map((b) => group(b, rect(b, T.laneFill) + rect(b.header, T.laneHeaderFill) + label(b)));
  const phases = bs.filter((b) => b.kind === 'phase').map((b) => group(b, rect(b, 'none') + rect(b.header, T.phaseHeaderFill) + label(b)));
  return lanes.join('') + phases.join('') + (corner ? rect(corner, T.phaseHeaderFill) : '');
}
