import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/rate-limit.ts';

describe('RateLimiter (URS-AI-019)', () => {
  it('slides: old hits expire', () => {
    const r = new RateLimiter(2, 1000);
    expect([r.take('a', 0).ok, r.take('a', 10).ok, r.take('a', 20).ok]).toEqual([true, true, false]);
    expect(r.take('b', 20).ok).toBe(true);
    expect(r.take('a', 1001).ok).toBe(true);
  });

  it('is off at 0', () => {
    const r = new RateLimiter(0, 1000);
    expect([1, 2, 3].every(() => r.take('a').ok)).toBe(true);
  });
});
