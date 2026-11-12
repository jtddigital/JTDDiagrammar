import type { Box, PlacedBand } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { BAND_FONT, DETAIL_FONT, DETAIL_GAP, fontOf } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { dash, opacity, type Palette } from './theme.ts';

const rect = (b: Box, fill: string, stroke: string, extra = '', width = 1) =>
  `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${num(width)}"${extra}/>`;

/** Header label, with detail text (URS-DM-020) in a smaller regular font below it; the block is centred in the header. */
const label = (b: PlacedBand) => {
  const font = fontOf(BAND_FONT, b.style);
  const fill = b.style?.text ? ` fill="${b.style.text}"` : '';
  const labelH = b.lines.length * lineHeight(font);
  const detailH = b.detail?.length ? DETAIL_GAP + b.detail.length * lineHeight(DETAIL_FONT) : 0;
  const top = b.header.y + (b.header.h - labelH - detailH) / 2;
  const cx = b.header.x + b.header.w / 2;
  return (
    lines(b.lines, cx, top, font, ` font-size="${num(font.size)}"${font.bold ? ' font-weight="bold"' : ''}${font.italic ? ' font-style="italic"' : ''}${fill}`) +
    (b.detail?.length ? lines(b.detail, cx, top + labelH + DETAIL_GAP, DETAIL_FONT, ` font-size="${DETAIL_FONT.size}" class="jtd-detail"${fill}`) : '')
  );
};

/** SVG id prefix per band kind (URS-RN-005): l-, p-, lg-, pg-. */
const PREFIX: Record<PlacedBand['kind'], string> = { lane: 'l', phase: 'p', laneGroup: 'lg', phaseGroup: 'pg' };
const group = (b: PlacedBand, body: string) => `<g id="${PREFIX[b.kind]}-${esc(b.id)}" class="jtd-${b.kind}"${opacity(b.style?.opacity)}>${body}</g>`;

/** Lane rows and phase columns with header cells, beneath edges and nodes (URS-RN-002). `style.fill` colours the header. */
export function bands(bs: readonly PlacedBand[], P: Palette, corner?: Box, fillers: readonly Box[] = []): string {
  const stroke = (b: PlacedBand) => b.style?.stroke ?? P.bandStroke;
  const width = (b: PlacedBand) => b.style?.lineWidth ?? 1;
  const lanes = bs
    .filter((b) => b.kind === 'lane')
    .map((b) => group(b, rect(b, P.laneFill, stroke(b), dash(b.style?.dash), width(b)) + rect(b.header, b.style?.fill ?? P.laneHeaderFill, stroke(b), '', width(b)) + label(b)));
  const phases = bs
    .filter((b) => b.kind === 'phase')
    .map((b) => group(b, rect(b, 'none', stroke(b), dash(b.style?.dash), width(b)) + rect(b.header, b.style?.fill ?? P.phaseHeaderFill, stroke(b), '', width(b)) + label(b)));
  // Group headers (URS-DM-019): header cells only; empty fillers over ungrouped bands.
  const groups = bs
    .filter((b) => b.kind === 'laneGroup' || b.kind === 'phaseGroup')
    .map((b) => group(b, rect(b.header, b.style?.fill ?? (b.kind === 'laneGroup' ? P.laneHeaderFill : P.phaseHeaderFill), stroke(b), '', width(b)) + label(b)));
  const blank = (x: Box) => rect(x, P.phaseHeaderFill, P.bandStroke);
  return lanes.join('') + phases.join('') + groups.join('') + fillers.map(blank).join('') + (corner ? blank(corner) : '');
}
