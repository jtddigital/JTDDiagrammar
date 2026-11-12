import type { Box, PlacedBand } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { BAND_FONT, fontOf } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { dash, opacity, type Palette } from './theme.ts';

const rect = (b: Box, fill: string, stroke: string, extra = '', width = 1) =>
  `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${num(width)}"${extra}/>`;

const label = (b: PlacedBand) => {
  const font = fontOf(BAND_FONT, b.style);
  return lines(
    b.lines,
    b.header.x + b.header.w / 2,
    b.header.y + (b.header.h - b.lines.length * lineHeight(font)) / 2,
    font,
    ` font-size="${num(font.size)}"${font.bold ? ' font-weight="bold"' : ''}${font.italic ? ' font-style="italic"' : ''}${b.style?.text ? ` fill="${b.style.text}"` : ''}`,
  );
};

const group = (b: PlacedBand, body: string) => `<g id="${b.kind[0]}-${esc(b.id)}" class="jtd-${b.kind}"${opacity(b.style?.opacity)}>${body}</g>`;

/** Lane rows and phase columns with header cells, beneath edges and nodes (URS-RN-002). `style.fill` colours the header. */
export function bands(bs: readonly PlacedBand[], P: Palette, corner?: Box): string {
  const stroke = (b: PlacedBand) => b.style?.stroke ?? P.bandStroke;
  const width = (b: PlacedBand) => b.style?.lineWidth ?? 1;
  const lanes = bs
    .filter((b) => b.kind === 'lane')
    .map((b) => group(b, rect(b, P.laneFill, stroke(b), dash(b.style?.dash), width(b)) + rect(b.header, b.style?.fill ?? P.laneHeaderFill, stroke(b), '', width(b)) + label(b)));
  const phases = bs
    .filter((b) => b.kind === 'phase')
    .map((b) => group(b, rect(b, 'none', stroke(b), dash(b.style?.dash), width(b)) + rect(b.header, b.style?.fill ?? P.phaseHeaderFill, stroke(b), '', width(b)) + label(b)));
  return lanes.join('') + phases.join('') + (corner ? rect(corner, P.phaseHeaderFill, P.bandStroke) : '');
}
