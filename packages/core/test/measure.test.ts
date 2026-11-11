import { describe, expect, it } from 'vitest';
import { textBlock, textWidth, wrap } from '../src/measure/text.ts';

describe('text measurement (URS-LY-009, URS-DM-007)', () => {
  it('uses Arial-compatible advance widths', () => {
    expect(textWidth('A', { size: 2048 })).toBe(1366);
    expect(textWidth('i', { size: 2048 })).toBe(455);
    expect(textWidth('A', { size: 2048, bold: true })).toBe(1479);
  });

  it('scales linearly with size and is additive', () => {
    expect(textWidth('AB', { size: 14 })).toBeCloseTo(2 * textWidth('A', { size: 14 }));
  });

  it('measures characters outside the table as 1em', () => {
    expect(textWidth('中', { size: 10 })).toBe(10);
  });

  it('honours explicit newlines and wraps on words', () => {
    const f = { size: 14 };
    expect(wrap('a\nb', 1000, f)).toEqual(['a', 'b']);
    expect(wrap('one two three', textWidth('one two', f), f)).toEqual(['one two', 'three']);
    expect(wrap('unbreakable', 1, f)).toEqual(['unbreakable']);
    expect(textBlock('a\nbb', 1000, f)).toEqual({ lines: ['a', 'bb'], width: textWidth('bb', f), height: 2 * 14 * 1.25 });
  });
});
