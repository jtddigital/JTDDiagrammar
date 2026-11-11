import type { PlacedContainer } from '../../geometry.ts';
import { lineHeight } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { CONTAINER_FONT, CONTAINER_HEAD_PAD } from '../../style.ts';
import { esc } from './escape.ts';
import { lines } from './text.ts';
import { THEME as T } from './theme.ts';

/** Composite regions: rounded box, label at the top, a divider under it (URS-DM-013). Outer first. */
export const containers = (cs: readonly PlacedContainer[]): string =>
  cs
    .map((c) => {
      const head = c.lines.length * lineHeight(CONTAINER_FONT) + 2 * CONTAINER_HEAD_PAD;
      return (
        `<g id="c-${esc(c.id)}" class="jtd-container" data-id="${esc(c.id)}">` +
        `<rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}" rx="12" fill="${T.containerFill}" stroke="${T.nodeStroke}" stroke-width="${T.stroke}"/>` +
        `<path d="M${num(c.x)} ${num(c.y + head)}H${num(c.x + c.w)}" stroke="${T.nodeStroke}" stroke-width="1"/>` +
        lines(c.lines, c.x + c.w / 2, c.y + CONTAINER_HEAD_PAD, CONTAINER_FONT, ` font-size="${CONTAINER_FONT.size}" font-weight="bold"`) +
        `</g>`
      );
    })
    .join('');
