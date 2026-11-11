import { describe, expect, it } from 'vitest';
import { pack } from '../src/layout/pack.ts';

describe('pack (URS-LY-002)', () => {
  it('centres a packed row on the wanted position', () => {
    expect(pack([0, 0, 0], [0, 10, 10])).toEqual([-10, 0, 10]);
  });

  it('keeps wanted positions when they are far enough apart', () => {
    expect(pack([0, 50, 100], [0, 10, 10])).toEqual([0, 50, 100]);
  });

  it('never violates minimum separation or order', () => {
    const out = pack([5, 0, 30, 31], [0, 10, 10, 10]);
    out.slice(1).forEach((x, i) => expect(x - out[i]!).toBeGreaterThanOrEqual(10 - 1e-9));
  });
});
