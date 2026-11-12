import type { PlacedLegend } from '../../geometry.ts';
import { textWidth } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { shape } from '../../shapes/library.ts';
import { LEGEND_FONT } from '../../style.ts';
import { LEGEND_TITLE } from '../../layout/legend.ts';
import { icon } from './icons.ts';
import { lines } from './text.ts';
import { dash, METRICS as M, type Palette } from './theme.ts';

/** The legend box (URS-DM-026): each entry's shape, icon or line sample, then its text. */
export function legend(l: PlacedLegend | undefined, P: Palette): string {
  if (!l) return '';
  const font = ` font-size="${LEGEND_FONT.size}"`;
  const items = l.items.map((it) => {
    const { x, y, w, h } = it.sample;
    const s = it.style;
    let sample: string;
    if (it.icon) sample = icon(it.icon, x, y, P.text);
    else if (!it.shape) {
      const l2 = it.line ?? {};
      sample = `<path d="M${num(x)} ${num(y + h / 2)}H${num(x + w)}" fill="none" stroke="${l2.stroke ?? P.edge}" stroke-width="${num(l2.lineWidth ?? M.stroke)}"${dash(l2.dash)}/>`;
    } else {
      const sh = shape(it.shape);
      const line = s?.stroke ?? P.nodeStroke;
      sample =
        `<g transform="translate(${num(x)} ${num(y)})"><path d="${sh.outline(w, h)}" fill="${s?.fill ?? (sh.paint ? P[sh.paint] : P.nodeFill)}" stroke="${line}" stroke-width="${num(s?.lineWidth ?? M.stroke)}"${dash(s?.dash)}/>` +
        (sh.solid ? `<path d="${sh.solid(w, h)}" fill="${line}"/>` : '') +
        '</g>';
    }
    return sample + lines(it.text.lines, it.text.x + it.text.w / 2, it.text.y, LEGEND_FONT, font);
  });
  const bold = { ...LEGEND_FONT, bold: true };
  const head = lines([LEGEND_TITLE], l.x + 10 + textWidth(LEGEND_TITLE, bold) / 2, l.y + 10, bold, `${font} font-weight="bold"`);
  return (
    `<g class="jtd-legend"><rect x="${num(l.x)}" y="${num(l.y)}" width="${num(l.w)}" height="${num(l.h)}" fill="${P.background}" stroke="${P.bandStroke}" stroke-width="1"/>` +
    head +
    items.join('') +
    '</g>'
  );
}
