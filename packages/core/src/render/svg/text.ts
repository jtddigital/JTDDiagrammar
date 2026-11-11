import { baseline, lineHeight, type Font } from '../../measure/text.ts';
import { num } from '../../num.ts';
import { esc } from './escape.ts';

/** One <text> per line, centred on `cx`, block starting at `top`. Baselines come from font metrics, not CSS. */
export const lines = (ls: readonly string[], cx: number, top: number, font: Font, attrs = ''): string =>
  ls
    .map((l, i) => `<text x="${num(cx)}" y="${num(top + i * lineHeight(font) + baseline(font))}" text-anchor="middle"${attrs}>${esc(l)}</text>`)
    .join('');
