import { describe, expect, it } from 'vitest';
import type { Geometry, PlacedNode, Point } from '../src/index.ts';
import { createRegistry, render } from '../src/index.ts';
import { quality } from '../src/layout/metrics.ts';
import { arrowSize, ENTRY_LINE, EXIT_STUB } from '../src/style.ts';
import { qualityFixtures } from './quality-fixtures.ts';

const reg = createRegistry();
const geo = (d: unknown): Geometry => {
  const r = render(d, reg);
  expect(r.diagnostics).toEqual([]);
  return r.geometry!;
};
const len = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const outside = (p: Point, n: PlacedNode) => p.x <= n.x + 0.5 || p.x >= n.x + n.w - 0.5 || p.y <= n.y + 0.5 || p.y >= n.y + n.h - 0.5;

describe('routing (URS-LY-013)', () => {
  it.each(qualityFixtures())('%s: every edge arrives from outside its node, with the line visible past the arrowhead', (_, doc) => {
    const g = geo(doc);
    const nodes = new Map(g.nodes.map((n) => [n.id, n]));
    for (const e of g.edges) {
      const [b, a] = [nodes.get(e.to), nodes.get(e.from)];
      if (!a || !b || a === b) continue;
      const [p, q] = [e.points.at(-2)!, e.points.at(-1)!];
      expect(outside(p, b), e.id).toBe(true);
      expect(outside(e.points[1]!, a), e.id).toBe(true);
      expect(len(p, q), e.id).toBeGreaterThanOrEqual(e.marker === 'none' ? EXIT_STUB - 0.5 : arrowSize(e.style?.lineWidth) + ENTRY_LINE - 0.5);
    }
  });

  it('turns into the bottom of a diamond from a task to its left and below, rather than jogging into its side', () => {
    const doc = {
      version: '1',
      type: 'flowchart',
      lanes: [{ id: 'top', label: 'Top' }, { id: 'low', label: 'Low' }],
      nodes: [
        { id: 'in', lane: 'top', to: [{ node: 'd' }] },
        { id: 't', label: 'Task', lane: 'low', to: [{ node: 'd' }] },
        { id: 'd', shape: 'decision', label: 'OK?', lane: 'top' },
      ],
    };
    const g = geo(doc);
    const d = g.nodes.find((n) => n.id === 'd')!;
    const e = g.edges.find((x) => x.from === 't')!;
    expect(e.points).toHaveLength(3);
    const [corner, tip] = e.points.slice(1);
    expect(tip).toEqual({ x: d.x + d.w / 2, y: d.y + d.h });
    expect(corner!.x).toBeCloseTo(tip!.x);
    expect(corner!.y - tip!.y).toBeGreaterThanOrEqual(arrowSize() + ENTRY_LINE - 0.5);
  });

  it('lines nodes up so the lifecycle example runs straight', () => {
    const ex = reg.type('lifecycle')!.examples[0]!.source;
    expect(quality(geo(ex)).bends).toBeLessThanOrEqual(2);
  });

  it('keeps side hints when shortening routes', () => {
    const doc = { version: '1', type: 'flowchart', nodes: [{ id: 'a', to: [{ node: 'b', exitSide: 'S', entrySide: 'S' }] }, { id: 'b' }] };
    const e = geo(doc).edges[0]!;
    expect(e.points[1]!.y).toBeGreaterThan(e.points[0]!.y);
    expect(e.points.at(-2)!.y).toBeGreaterThan(e.points.at(-1)!.y);
  });
});
