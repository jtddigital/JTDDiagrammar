import { describe, expect, it } from 'vitest';
import { allocateTips } from '../src/layout/layered/route.ts';

const e = (end: 0 | 1, key: number, align = Math.abs(key)) => ({ chain: 0, end, key, align });

describe('diamond tip allocation (URS-LY-007)', () => {
  it('one in, two out: the aligned branch runs straight, the other leaves the side facing its route', () => {
    expect(allocateTips([e(1, 0), e(0, 0, 5), e(0, 50, 80)], 0)).toEqual(['ms', 'me', 'ce']);
    expect(allocateTips([e(1, 0), e(0, -50, 80), e(0, 0, 5)], 0)).toEqual(['ms', 'cs', 'me']);
  });

  it('never shares a tip while one is free, and never routes through the diamond', () => {
    const tips = allocateTips([e(1, 0), e(1, -40), e(0, -30), e(0, 30)], 0)!;
    expect(new Set(tips).size).toBe(4);
    expect(tips[0]).toBe('ms');
    expect(tips.slice(2)).not.toContain('ms');
    expect(tips.slice(0, 2)).not.toContain('me');
  });

  it('falls back (undefined) beyond four edges or when only a through-route remains', () => {
    expect(allocateTips([e(0, 0), e(0, 1), e(0, 2), e(0, 3), e(0, 4)], 0)).toBeUndefined();
    expect(allocateTips([e(0, 0), e(0, 1), e(0, 2), e(0, 3)], 0)).toBeUndefined();
  });
});
