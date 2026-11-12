import { baseline, lineHeight, type Font } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { esc } from './escape.ts';

/** One <text> per line, centred on `cx`, block starting at `top`. Baselines come from font metrics, not CSS. */
export const lines = (ls: readonly string[], cx: number, top: number, font: Font, attrs = ''): string =>
  ls
    .map((l, i) => `<text x="${num(cx)}" y="${num(top + i * lineHeight(font) + baseline(font))}" text-anchor="middle"${attrs}>${esc(l)}</text>`)
    .join('');

/** Size, weight and slant attributes for text that differs from the inherited font (URS-DM-016). */
export const fontAttrs = (font: Font, inherited: Font): string =>
  (font.size !== inherited.size ? ` font-size="${num(font.size)}"` : '') +
  (font.bold && !inherited.bold ? ' font-weight="bold"' : '') +
  (!font.bold && inherited.bold ? ' font-weight="normal"' : '') +
  (font.italic ? ' font-style="italic"' : '');
