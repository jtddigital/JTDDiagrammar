import type { PlacedContainer } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { CONTAINER_FONT, fontOf } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { dash, METRICS, opacity, type Palette } from './theme.ts';

/** Composite regions: rounded box, label at the top, a divider under it (URS-DM-013). Outer first. */
export const containers = (cs: readonly PlacedContainer[], P: Palette): string =>
  cs
    .map((c) => {
      const font = fontOf(CONTAINER_FONT, c.style);
      const head = c.head;
      const stroke = c.style?.stroke ?? P.nodeStroke;
      const width = c.style?.lineWidth;
      return (
        `<g id="c-${esc(c.id)}" class="jtd-container"${opacity(c.style?.opacity)}>` +
        `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}" rx="12" fill="${c.style?.fill ?? P.containerFill}" stroke="${stroke}" stroke-width="${num(width ?? METRICS.stroke)}"${dash(c.style?.dash)}/>` +
        `<path d="M${num(c.x)} ${num(c.y + head)}H${num(c.x + c.w)}" stroke="${stroke}" stroke-width="${num(width ?? 1)}"/>` +
        lines(c.lines, c.x + c.w / 2, c.y + (head - c.lines.length * lineHeight(font)) / 2, font, ` font-size="${num(font.size)}"${font.bold ? ' font-weight="bold"' : ''}${font.italic ? ' font-style="italic"' : ''}${c.style?.text ? ` fill="${c.style.text}"` : ''}`) +
        `</g>`
      );
    })
    .join('');
