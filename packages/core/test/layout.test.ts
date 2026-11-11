import { describe, expect, it } from 'vitest';
import type { Box, Geometry, Point } from '../src/index.ts';
import { createRegistry, render } from '../src/index.ts';
import { fixtures } from './fixtures.ts';

const reg = createRegistry();
const geometry = (doc: unknown): Geometry => render(doc, reg).geometry!;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onBox = (p: Point, b: Box) => p.x >= b.x - 0.5 && p.x <= b.x + b.w + 0.5 && p.y >= b.y - 0.5 && p.y <= b.y + b.h + 0.5;

describe.each(fixtures())('layout invariants: %s', (_name, doc) => {
  const g = geometry(doc);

  it('nodes never overlap (URS-LY-002)', () => {
    g.nodes.forEach((a, i) => g.nodes.slice(i + 1).forEach((b) => expect(overlap(a, b), `${a.id}/${b.id}`).toBe(false)));
  });

  it('every edge segment is orthogonal (URS-LY-005)', () => {
    for (const e of g.edges) e.points.slice(1).forEach((p, i) => expect(p.x === e.points[i]!.x || p.y === e.points[i]!.y, e.id).toBe(true));
  });

  it('edges start and end on their nodes', () => {
    const box = new Map(g.nodes.map((n) => [n.id, n]));
    for (const e of g.edges) {
      expect(onBox(e.points[0]!, box.get(e.from)!), `${e.id} start`).toBe(true);
      expect(onBox(e.points.at(-1)!, box.get(e.to)!), `${e.id} end`).toBe(true);
    }
  });

  it('is deterministic (URS-LY-001)', () => {
    expect(render(doc, reg).svg).toBe(render(structuredClone(doc), reg).svg);
  });
});

describe('layered engine', () => {
  const chain = (direction: string) => ({
    version: '1',
    type: 'flowchart',
    direction,
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  });

  it('flows left-to-right or top-to-bottom (URS-DM-003)', () => {
    const lr = geometry(chain('LR')).nodes;
    const tb = geometry(chain('TB')).nodes;
    expect(lr[0]!.x < lr[1]!.x && lr[1]!.x < lr[2]!.x).toBe(true);
    expect(tb[0]!.y < tb[1]!.y && tb[1]!.y < tb[2]!.y).toBe(true);
  });

  it('orders nodes by edge direction and tolerates cycles (URS-LY-004)', () => {
    const doc = { ...chain('LR'), edges: [...chain('LR').edges, { from: 'c', to: 'a' }] };
    const n = geometry(doc).nodes;
    expect(n[0]!.x < n[1]!.x && n[1]!.x < n[2]!.x).toBe(true);
    expect(geometry(doc).edges).toHaveLength(3);
  });

  it('warns that lanes are not laid out yet', () => {
    const ex = reg.type('flowchart')!.examples[1]!.source;
    expect(render(ex, reg).diagnostics.map((d) => [d.severity, d.code])).toEqual([['warning', 'layout.partitions']]);
  });
});
