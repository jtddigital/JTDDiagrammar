import { describe, expect, it } from 'vitest';
import { createRegistry, render } from '../src/index.ts';
import { max, min } from '../src/math.ts';
import { normalize } from '../src/layout/normalize.ts';

const reg = createRegistry();

describe('scale', () => {
  it('min/max handle arrays too large to spread', () => {
    const xs = Array.from({ length: 300_000 }, (_, i) => i - 7);
    expect([min(xs), max(xs), min([], 5)]).toEqual([-7, 299_992, 5]);
  });

  it('normalize handles very many points', () => {
    const points = Array.from({ length: 300_000 }, (_, i) => ({ x: i, y: -i }));
    const g = normalize({ bands: [], containers: [], nodes: [], edges: [{ id: 'e', from: 'a', to: 'b', points }] });
    expect([g.width, g.height]).toEqual([299_999, 299_999]);
  });

  it('enforces node and edge limits before layout (URS-API-006)', () => {
    const doc = { version: '1', type: 'flowchart', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] };
    expect(render(doc, reg, { maxNodes: 1, maxEdges: 0 }).diagnostics.map((d) => d.code)).toEqual(['limit.nodes', 'limit.edges']);
    expect(render(doc, reg, { maxNodes: 2, maxEdges: 1 }).svg).toBeDefined();
  });

  it('lays out 200 nodes / 300 edges within budget (URS-LY-010)', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nodes = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, label: `Step ${i}` }));
    const edges = Array.from({ length: 300 }, () => ({ from: `n${Math.floor(rnd() * 200)}`, to: `n${Math.floor(rnd() * 200)}` }));
    const t = performance.now();
    const r = render({ version: '1', type: 'flowchart', nodes, edges }, reg);
    expect(r.svg).toBeDefined();
    expect(performance.now() - t).toBeLessThan(500);
  });
});
