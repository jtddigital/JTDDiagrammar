import { describe, expect, it } from 'vitest';
import type { GraphIR } from '../src/index.ts';
import { compile, createRegistry, render } from '../src/index.ts';
import { stacksOf } from '../src/diagrams/orgchart/model.ts';
import { tree } from '../src/layout/tree/index.ts';
import { overlaps } from '../src/layout/metrics.ts';

const reg = createRegistry();
const ir = (people: { id: string; manager?: string; stack?: number }[], direction: 'TB' | 'LR' = 'TB'): GraphIR => ({
  direction,
  nodes: people.map((p) => ({ id: p.id, shape: 'card', label: p.id, ...(p.stack !== undefined && { stack: p.stack }) })),
  edges: people.flatMap((p) => (p.manager ? [{ id: `e-${p.id}`, from: p.manager, to: p.id, marker: 'none' as const }] : [])),
  containers: [],
});
const team = (stack?: number, n = 5) => [{ id: 'm', ...(stack !== undefined && { stack }) }, ...Array.from({ length: n }, (_, i) => ({ id: `k${i}`, manager: 'm' }))];
const geo = (g: GraphIR) => tree.layout(g).geometry;
const node = (g: ReturnType<typeof geo>, id: string) => g.nodes.find((n) => n.id === id)!;
const edge = (g: ReturnType<typeof geo>, id: string) => g.edges.find((e) => e.id === id)!;
const orthogonal = (ps: { x: number; y: number }[]) => ps.slice(1).every((p, i) => p.x === ps[i]!.x || p.y === ps[i]!.y);

describe('tree layout (URS-LY-014)', () => {
  it('puts children in a row under their parent, joined by a bus', () => {
    const g = geo(ir(team(undefined, 3)));
    const m = node(g, 'm');
    const kids = ['k0', 'k1', 'k2'].map((id) => node(g, id));
    expect(new Set(kids.map((k) => k.y)).size).toBe(1);
    expect(kids[0]!.y).toBeGreaterThan(m.y + m.h);
    expect(kids.map((k) => k.x)).toEqual([...kids.map((k) => k.x)].sort((a, b) => a - b));
    // The parent sits centred over its first and last child.
    expect(m.x + m.w / 2).toBeCloseTo((kids[0]!.x + kids[0]!.w / 2 + kids[2]!.x + kids[2]!.w / 2) / 2);
    const e = edge(g, 'e-k0').points;
    expect(e[0]).toEqual({ x: m.x + m.w / 2, y: m.y + m.h });
    expect(e.at(-1)).toEqual({ x: kids[0]!.x + kids[0]!.w / 2, y: kids[0]!.y });
    expect(orthogonal(e)).toBe(true);
  });

  it('stacks children in one column, each joined from the side', () => {
    const g = geo(ir(team(1, 4)));
    const kids = ['k0', 'k1', 'k2', 'k3'].map((id) => node(g, id));
    expect(new Set(kids.map((k) => k.x)).size).toBe(1);
    expect(kids.map((k) => k.y)).toEqual([...kids.map((k) => k.y)].sort((a, b) => a - b));
    for (const k of kids) {
      const end = edge(g, `e-${k.id}`).points.at(-1)!;
      expect(end).toEqual({ x: k.x, y: k.y + k.h / 2 });
    }
  });

  it('splits a stacked team into columns, in order down each column', () => {
    const g = geo(ir(team(2, 5)));
    const xs = ['k0', 'k1', 'k2', 'k3', 'k4'].map((id) => node(g, id).x);
    expect(xs.slice(0, 3).every((x) => x === xs[0])).toBe(true);
    expect(xs.slice(3).every((x) => x === xs[3])).toBe(true);
    expect(xs[3]).toBeGreaterThan(xs[0]!);
    // More columns than people: one each.
    expect(new Set(['k0', 'k1'].map((id) => node(geo(ir(team(6, 2))), id).x)).size).toBe(2);
  });

  it('runs left to right by turning the layout', () => {
    const g = geo(ir(team(undefined, 3), 'LR'));
    const m = node(g, 'm');
    for (const id of ['k0', 'k1', 'k2']) expect(node(g, id).x).toBeGreaterThan(m.x + m.w);
    const s = geo(ir(team(1, 3), 'LR'));
    expect(new Set(['k0', 'k1', 'k2'].map((id) => node(s, id).y)).size).toBe(1);
  });

  it('never overlaps nodes, whatever the tree and stacking', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 60; run++) {
      const people = Array.from({ length: 2 + Math.floor(rnd() * 30) }, (_, i) => ({
        id: `p${i}`,
        ...(i > 0 && { manager: `p${Math.floor(rnd() * i)}` }),
        ...(rnd() < 0.5 && { stack: 1 + Math.floor(rnd() * 3) }),
      }));
      for (const dir of ['TB', 'LR'] as const) {
        const g = geo(ir(people, dir));
        for (let i = 0; i < g.nodes.length; i++)
          for (let j = i + 1; j < g.nodes.length; j++) expect(overlaps(g.nodes[i]!, g.nodes[j]!), `run ${run} ${dir} ${g.nodes[i]!.id}/${g.nodes[j]!.id}`).toBe(false);
        expect(g.edges.every((e) => orthogonal(e.points))).toBe(true);
      }
    }
  });

  it('places every node of a forest or a cycle; extra parents are drawn straight', () => {
    const g = geo({
      direction: 'TB',
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id, shape: 'card', label: id })),
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'cd', from: 'c', to: 'd' },
        { id: 'dc', from: 'd', to: 'c' },
        { id: 'xb', from: 'c', to: 'b' },
      ],
      containers: [],
    });
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(edge(g, 'xb').points).toHaveLength(2);
  });
});

describe('org chart stacking (URS-TYP-011)', () => {
  it('stacks teams chart-wide or per person; multi sets the columns and implies stack', () => {
    expect(stacksOf({}, {})).toBeUndefined();
    expect(stacksOf({ stack: true }, {})).toBe(1);
    expect(stacksOf({ multi: 3 }, {})).toBe(3);
    expect(stacksOf({ stack: true, multi: 2 }, { stack: false })).toBeUndefined();
    expect(stacksOf({}, { stack: true })).toBe(1);
    expect(stacksOf({ multi: 2 }, { stack: true })).toBe(2);
    expect(stacksOf({ stack: true }, { multi: 4 })).toBe(4);
  });

  it('carries the stacking into the IR and draws every example cleanly', () => {
    const t = reg.type('orgchart')!;
    const stacked = compile(t.examples.find((e) => e.name === 'stacked')!.source, reg).ir!;
    expect(stacked.nodes.find((n) => n.id === 'vp')!.stack).toBeUndefined();
    expect(stacked.nodes.find((n) => n.id === 'web')!.stack).toBe(1);
    for (const ex of t.examples) expect(render(ex.source, reg).diagnostics, ex.name).toEqual([]);
    const bad = compile({ version: '1', type: 'orgchart', multi: 0, people: [{ id: 'a', name: 'A' }] }, reg);
    expect(bad.diagnostics.map((d) => d.path)).toEqual(['/multi']);
  });
});
