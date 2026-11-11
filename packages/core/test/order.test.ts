import { describe, expect, it } from 'vitest';
import { createRegistry, render } from '../src/index.ts';
import { inversions } from '../src/layout/layered/order.ts';

describe('crossing count (URS-LY-007)', () => {
  it('matches brute force on random segment sets', () => {
    let s = 5;
    const rnd = (n: number) => Math.floor(((s = (s * 16807) % 2147483647) / 2147483647) * n);
    for (let round = 0; round < 50; round++) {
      const pairs = Array.from({ length: rnd(40) }, (): [number, number] => [rnd(10), rnd(10)]);
      let brute = 0;
      for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) if ((pairs[i]![0] - pairs[j]![0]) * (pairs[i]![1] - pairs[j]![1]) < 0) brute++;
      expect(inversions(pairs.map((p) => [...p] as [number, number]))).toBe(brute);
    }
  });
});

describe('order hints (URS-DM-008)', () => {
  const reg = createRegistry();
  const doc = (orders: (number | undefined)[]) => ({
    version: '1',
    type: 'flowchart',
    direction: 'TB',
    nodes: [{ id: 'root' }, ...orders.map((o, i) => ({ id: `c${i}`, ...(o !== undefined && { order: o }) }))],
    edges: orders.map((_, i) => ({ from: 'root', to: `c${i}` })),
  });
  const xs = (d: unknown) => Object.fromEntries(render(d, reg).geometry!.nodes.map((n) => [n.id, n.x]));

  it('places hinted siblings in hint order', () => {
    const x = xs(doc([3, 1, 2]));
    expect(x.c1! < x.c2! && x.c2! < x.c0!).toBe(true);
  });

  it('reverses when the hints reverse', () => {
    const x = xs(doc([1, 2, 3]));
    expect(x.c0! < x.c1! && x.c1! < x.c2!).toBe(true);
  });

  it('keeps unhinted siblings where the heuristic put them', () => {
    const x = xs(doc([2, undefined, 1]));
    expect(x.c2! < x.c0!).toBe(true);
  });
});
