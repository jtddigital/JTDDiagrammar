import { baseline, lineHeight, type Font } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { SUB_GAP, subFont } from '../../style.ts';
import { esc } from './escape.ts';

/** One <text> per line, centred on `cx`, block starting at `top`. Baselines come from font metrics, not CSS. */
export const lines = (ls: readonly string[], cx: number, top: number, font: Font, attrs = ''): string =>
  ls
    .map((l, i) => `<text x="${num(cx)}" y="${num(top + i * lineHeight(font) + baseline(font))}" text-anchor="middle"${attrs}>${esc(l)}</text>`)
    .join('');

/**
 * Label lines, then a divider `rule` wide and the secondary lines in the smaller font (URS-DM-021).
 * `attrs(font)` gives each block's text attributes.
 */
export const stack = (ls: readonly string[], sub: readonly string[] | undefined, cx: number, top: number, font: Font, attrs: (f: Font) => string, rule: number, color: string): string => {
  if (!sub?.length) return lines(ls, cx, top, font, attrs(font));
  const y = top + ls.length * lineHeight(font) + SUB_GAP / 2;
  return (
    lines(ls, cx, top, font, attrs(font)) +
    `<path d="M${num(cx - rule / 2)} ${num(y)}H${num(cx + rule / 2)}" fill="none" stroke="${color}" stroke-width="1"/>` +
    lines(sub, cx, y + SUB_GAP / 2, subFont(font), attrs(subFont(font)))
  );
};

/** Size, weight and slant attributes for text that differs from the inherited font (URS-DM-016). */
export const fontAttrs = (font: Font, inherited: Font): string =>
  (font.size !== inherited.size ? ` font-size="${num(font.size)}"` : '') +
  (font.bold && !inherited.bold ? ' font-weight="bold"' : '') +
  (!font.bold && inherited.bold ? ' font-weight="normal"' : '') +
  (font.italic ? ' font-style="italic"' : '');
