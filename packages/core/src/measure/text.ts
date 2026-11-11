import { FONT } from './font-metrics.ts';

/** Deterministic text metrics from a bundled table: identical in Node and browsers (URS-LY-009). */
export interface Font {
  size: number;
  bold?: boolean;
}

export const FONT_FAMILY = FONT.family;
export const LINE_HEIGHT = 1.25;

const advance = (cp: number, bold: boolean): number => (bold ? FONT.bold : FONT.regular)[cp - FONT.firstCode] ?? FONT.unitsPerEm;

export function textWidth(text: string, font: Font): number {
  let units = 0;
  for (const ch of text) units += advance(ch.codePointAt(0) ?? 0, font.bold ?? false);
  return (units * font.size) / FONT.unitsPerEm;
}

export const lineHeight = (font: Font): number => font.size * LINE_HEIGHT;

/** Distance from the top of a line box to its baseline. */
export function baseline(font: Font): number {
  const asc = (FONT.ascender * font.size) / FONT.unitsPerEm;
  const desc = (FONT.descender * font.size) / FONT.unitsPerEm;
  return (lineHeight(font) - asc - desc) / 2 + asc;
}

/** Split on `\n`, then greedy word-wrap at `maxWidth` (URS-DM-007). Words are never broken. */
export function wrap(text: string, maxWidth: number, font: Font): string[] {
  return text.split('\n').flatMap((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = words.shift() ?? '';
    for (const w of words) {
      const next = `${line} ${w}`;
      if (textWidth(next, font) <= maxWidth) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    return [...lines, line];
  });
}

export interface TextBlock {
  lines: string[];
  width: number;
  height: number;
}

export function textBlock(text: string, maxWidth: number, font: Font): TextBlock {
  const lines = wrap(text, maxWidth, font);
  return { lines, width: Math.max(0, ...lines.map((l) => textWidth(l, font))), height: lines.length * lineHeight(font) };
}
