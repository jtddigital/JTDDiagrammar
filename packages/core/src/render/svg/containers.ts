import type { PlacedContainer } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { CONTAINER_FONT, CONTAINER_HEAD_PAD } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { dash, METRICS, type Palette } from './theme.ts';

/** Composite regions: rounded box, label at the top, a divider under it (URS-DM-013). Outer first. */
export const containers = (cs: readonly PlacedContainer[], P: Palette): string =>
  cs
    .map((c) => {
      const head = c.lines.length * lineHeight(CONTAINER_FONT) + 2 * CONTAINER_HEAD_PAD;
      const stroke = c.style?.stroke ?? P.nodeStroke;
      return (
        `<g id="c-${esc(c.id)}" class="jtd-container">` +
        `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}" rx="12" fill="${c.style?.fill ?? P.containerFill}" stroke="${stroke}" stroke-width="${METRICS.stroke}"${dash(c.style?.dash)}/>` +
        `<path d="M${num(c.x)} ${num(c.y + head)}H${num(c.x + c.w)}" stroke="${stroke}" stroke-width="1"/>` +
        lines(c.lines, c.x + c.w / 2, c.y + CONTAINER_HEAD_PAD, CONTAINER_FONT, ` font-size="${CONTAINER_FONT.size}" font-weight="bold"${c.style?.text ? ` fill="${c.style.text}"` : ''}`) +
        `</g>`
      );
    })
    .join('');
