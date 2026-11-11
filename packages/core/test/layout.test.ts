import { describe, expect, it } from 'vitest';
import type { Box, Geometry, Point } from '../src/index.ts';
import { compile, createRegistry, render } from '../src/index.ts';
import { lineHeight } from '../src/measure/text.ts';
import { CONTAINER_FONT, CONTAINER_HEAD_PAD } from '../src/style.ts';
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
    const box = new Map<string, Box>([...g.nodes, ...g.containers].map((n) => [n.id, n]));
    for (const e of g.edges) {
      expect(onBox(e.points[0]!, box.get(e.from)!), `${e.id} start`).toBe(true);
      expect(onBox(e.points.at(-1)!, box.get(e.to)!), `${e.id} end`).toBe(true);
    }
  });

  it('routes self-loops around their node (URS-LY-011)', () => {
    const box = new Map<string, Box>([...g.nodes, ...g.containers].map((n) => [n.id, n]));
    const strictlyInside = (p: Point, b: Box) => p.x > b.x + 0.5 && p.x < b.x + b.w - 0.5 && p.y > b.y + 0.5 && p.y < b.y + b.h - 0.5;
    for (const e of g.edges.filter((x) => x.from === x.to)) {
      expect(e.points.length).toBeGreaterThanOrEqual(4);
      for (const p of e.points) expect(strictlyInside(p, box.get(e.from)!), e.id).toBe(false);
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
});

interface Src {
  direction?: string;
  lanes?: { id: string }[];
  phases?: { id: string }[];
  nodes: { id: string; lane?: string; phase?: string }[];
}
const partitioned = fixtures().filter(([, d]) => (d as Src).lanes) as [string, Src][];
const inside = (a: Box, b: Box) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6;
const intersect = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
};

describe.each(partitioned)('partitions: %s', (_name, doc) => {
  const g = geometry(doc);
  const band = (kind: string, id: string) => g.bands.find((b) => b.kind === kind && b.id === id)!;
  const lanes = g.bands.filter((b) => b.kind === 'lane');
  const phases = g.bands.filter((b) => b.kind === 'phase');

  it('draws one band per lane and phase, in source order (URS-DM-001/002)', () => {
    expect(lanes.map((b) => b.id)).toEqual(doc.lanes!.map((l) => l.id));
    expect(phases.map((b) => b.id)).toEqual((doc.phases ?? []).map((p) => p.id));
  });

  it('keeps every node inside its lane x phase cell, clear of headers (URS-LY-002)', () => {
    // Lanes come from the IR: derived nodes (notes) inherit theirs.
    const ir = new Map(compile(doc, reg).ir!.nodes.map((x) => [x.id, x]));
    for (const n of g.nodes) {
      const src = ir.get(n.id)!;
      const cells = [band('lane', src.lane!), ...(src.phase ? [band('phase', src.phase)] : [])];
      for (const c of cells) {
        expect(inside(n, c), `${n.id} in ${c.id}`).toBe(true);
        expect(overlap(n, c.header), `${n.id} clear of ${c.id} header`).toBe(false);
      }
    }
  });

  it('lanes span all phases and phases span all lanes (URS-LY-003)', () => {
    const lr = doc.direction !== 'TB';
    for (const l of lanes)
      for (const p of phases) {
        const cell = intersect(l, p);
        expect(lr ? cell.h : cell.w, `${l.id} x ${p.id} cross`).toBeCloseTo(lr ? l.h : l.w);
        expect(lr ? cell.w : cell.h, `${l.id} x ${p.id} main`).toBeCloseTo(lr ? p.w : p.h);
      }
    const ends = lanes.map((l) => (lr ? l.x + l.w : l.y + l.h));
    expect(new Set(ends.map((e) => e.toFixed(2))).size).toBe(1);
  });
});

describe('cross-functional is a flowchart with lanes (URS-TYP-002)', () => {
  it('renders the same nodes with and without lanes and phases', () => {
    const cff = reg.type('flowchart')!.examples[1]!.source as Src;
    const plain = { ...cff, lanes: undefined, phases: undefined, nodes: cff.nodes.map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'lane' && k !== 'phase'))) };
    const [a, b] = [render(cff, reg), render(JSON.parse(JSON.stringify(plain)), reg)];
    expect([a.diagnostics, b.diagnostics]).toEqual([[], []]);
    expect(a.geometry!.nodes.map((n) => n.id).sort()).toEqual(b.geometry!.nodes.map((n) => n.id).sort());
    expect([a.geometry!.bands.length, b.geometry!.bands.length]).toEqual([5, 0]);
  });
});

const nested = fixtures().filter(([, d]) => (compile(d, reg).ir?.containers.length ?? 0) > 0);

describe.each(nested)('containers: %s (URS-LY-012, URS-DM-013)', (_name, doc) => {
  const ir = compile(doc, reg).ir!;
  const g = geometry(doc);
  const parent = new Map([...ir.nodes, ...ir.containers].map((e) => [e.id, e.parent]));
  const within = (id: string, c: string): boolean => {
    for (let p = parent.get(id); p !== undefined; p = parent.get(p)) if (p === c) return true;
    return false;
  };
  const boxes = new Map<string, Box>([...g.nodes, ...g.containers].map((b) => [b.id, b]));
  const head = (c: (typeof g.containers)[number]) => c.lines.length * lineHeight(CONTAINER_FONT) + 2 * CONTAINER_HEAD_PAD;

  it('draws every container, outer before inner', () => {
    expect(g.containers.map((c) => c.id).sort()).toEqual(ir.containers.map((c) => c.id).sort());
    g.containers.forEach((c, i) => i && expect(c.depth).toBeGreaterThanOrEqual(g.containers[i - 1]!.depth));
  });

  it('keeps content inside its container, below the label', () => {
    for (const c of g.containers)
      for (const [id, b] of boxes)
        if (within(id, c.id)) {
          expect(inside(b, c), `${id} inside ${c.id}`).toBe(true);
          expect(b.y, `${id} below ${c.id} label`).toBeGreaterThanOrEqual(c.y + head(c) - 1e-6);
        }
  });

  it('keeps everything else outside each container', () => {
    for (const c of g.containers)
      for (const [id, b] of boxes)
        if (id !== c.id && !within(id, c.id) && !within(c.id, id)) expect(overlap(b, c), `${id} vs ${c.id}`).toBe(false);
  });
});
