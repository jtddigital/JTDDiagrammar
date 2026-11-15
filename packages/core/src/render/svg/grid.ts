import type { PlacedCell, PlacedRule } from '../../geometry.ts';
import { baseline, lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { TABLE_FONT } from '../../style.ts';
import { esc } from './escape.ts';
import { dash, type Palette } from './theme.ts';

/** Space between a cell's edge and its text. */
export const CELL_PAD = 6;
const MARKER = '#dc2626';

/** Tables, time axes and shaded periods, behind everything else (URS-LY-015). */
export function grid(cells: readonly PlacedCell[] = [], rules: readonly PlacedRule[] = [], P: Palette): string {
  if (!cells.length && !rules.length) return '';
  const boxes = cells
    .filter((c) => c.fill || c.border)
    .map((c) => `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}" fill="${c.fill === 'header' ? P.phaseHeaderFill : c.fill === 'shade' ? P.laneHeaderFill : 'none'}"${c.border ? ` stroke="${P.bandStroke}" stroke-width="1"` : ''}/>`);
  const lines = rules.map((r) => {
    const color = r.kind === 'marker' ? (r.style?.stroke ?? MARKER) : P.bandStroke;
    const width = r.style?.lineWidth ?? (r.kind === 'marker' ? 1.5 : 0.75);
    const line = `<path d="M${num(r.from.x)} ${num(r.from.y)}L${num(r.to.x)} ${num(r.to.y)}" fill="none" stroke="${color}" stroke-width="${num(width)}"${dash(r.style?.dash ?? (r.kind === 'marker' ? 'dashed' : undefined))}/>`;
    const label = r.label ? `<text x="${num(r.from.x - 4)}" y="${num(r.to.y - 4)}" text-anchor="end" font-size="${TABLE_FONT.size - 1}" fill="${color}">${esc(r.label)}</text>` : '';
    return line + label;
  });
  const texts = cells
    .filter((c) => c.text)
    .map((c) => {
      const [x, anchor] = c.align === 'right' ? [c.x + c.w - CELL_PAD, 'end'] : c.align === 'center' ? [c.x + c.w / 2, 'middle'] : [c.x + CELL_PAD + (c.indent ?? 0), 'start'];
      const y = c.y + (c.h - lineHeight(TABLE_FONT)) / 2 + baseline(TABLE_FONT);
      return `<text x="${num(x)}" y="${num(y)}" text-anchor="${anchor}" font-size="${TABLE_FONT.size}"${c.bold ? ' font-weight="bold"' : ''}>${esc(c.text!)}</text>`;
    });
  return `<g class="jtd-grid">${boxes.join('')}${lines.join('')}${texts.join('')}</g>`;
}
