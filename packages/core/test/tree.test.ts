import { describe, expect, it } from 'vitest';
import type { GraphIR } from '../src/index.ts';
import { compile, createRegistry, render } from '../src/index.ts';
import { stacksOf } from '../src/diagrams/orgchart/model.ts';
import { tree } from '../src/layout/tree/index.ts';
import { hits, overlaps } from '../src/layout/metrics.ts';

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

const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

describe('tree layout containers (URS-LY-014, URS-TYP-012)', () => {
  /** Random trees where each subtree may start a department, nested in the one above it. */
  function random(rnd: () => number) {
    const n = 2 + Math.floor(rnd() * 25);
    const containers: { id: string; label: string; parent?: string }[] = [];
    const nodes: GraphIR['nodes'] = [];
    const edges: GraphIR['edges'] = [];
    // Departments a manager's reports have started, so a later sibling can join one: a department with no head.
    const started = new Map<number, string[]>();
    for (let i = 0; i < n; i++) {
      const up = i ? Math.floor(rnd() * i) : undefined;
      let parent = up === undefined ? undefined : nodes[up]!.parent;
      const shared = started.get(up ?? -1) ?? [];
      // Or join a department started elsewhere, reporting into it from a second place.
      const under = (c: string | undefined): boolean => c === parent || (c !== undefined && under(containers.find((k) => k.id === c)?.parent));
      const elsewhere = containers.filter((c) => under(c.id));
      if (shared.length && rnd() < 0.3) parent = shared[Math.floor(rnd() * shared.length)]!;
      else if (elsewhere.length && rnd() < 0.15) parent = elsewhere[Math.floor(rnd() * elsewhere.length)]!.id;
      else if (rnd() < 0.25) {
        const id = `c${containers.length}`;
        containers.push({ id, label: `Department ${id}`, ...(parent && { parent }) });
        parent = id;
        started.set(up ?? -1, [...shared, id]);
      }
      nodes.push({ id: `p${i}`, shape: 'card', label: `p${i}`, ...(parent && { parent }), ...(rnd() < 0.4 && { stack: 1 + Math.floor(rnd() * 2) }) });
      if (up !== undefined) edges.push({ id: `e${i}`, from: `p${up}`, to: `p${i}` });
    }
    return { nodes, edges, containers };
  }

  it('boxes each container around its members, nested ones inside, apart from unrelated ones', () => {
    let split = 0;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 60; run++) {
      const g0 = random(rnd);
      // Every fourth run each way of saving space, so tight spacing keeps the same guarantees (URS-TYP-014).
      const compact = ([undefined, 'horizontal', 'vertical', 'both'] as const)[run % 4];
      for (const direction of ['TB', 'LR'] as const) {
        const g = geo({ direction, ...g0, ...(compact && { compact }) });
        // A container may be drawn in several places: once for each manager outside it its people report to.
        const parts = (c: string) => g.containers.filter((x) => x.id === c);
        if (direction === 'TB') split += g.containers.length - new Set(g.containers.map((c) => c.id)).size;
        const where = `run ${run} ${direction}`;
        for (let i = 0; i < g.nodes.length; i++) for (let j = i + 1; j < g.nodes.length; j++) expect(overlaps(g.nodes[i]!, g.nodes[j]!), where).toBe(false);
        for (const n of g0.nodes) if (n.parent) expect(parts(n.parent).some((b) => inside(g.nodes.find((x) => x.id === n.id)!, b)), `${where} ${n.id}`).toBe(true);
        const ancestors = (c: string) => {
          const out: string[] = [];
          for (let x = g0.containers.find((k) => k.id === c)?.parent; x; x = g0.containers.find((k) => k.id === x)?.parent) out.push(x);
          return out;
        };
        for (const c of g.containers) for (const a of ancestors(c.id)) expect(parts(a).some((b) => inside(c, b)), `${where} ${c.id} in ${a}`).toBe(true);
        for (const a of g.containers)
          for (const b of g.containers)
            if (a !== b && !ancestors(a.id).includes(b.id) && !ancestors(b.id).includes(a.id)) expect(overlaps(a, b), `${where} ${a.id}/${b.id}`).toBe(false);
        for (const c of g.containers) expect(c.depth).toBe(ancestors(c.id).length);
        // Nobody outside a department sits in its box.
        const memberOf = (id: string, c: string) => {
          const n = g0.nodes.find((x) => x.id === id)!;
          return n.parent === c || (n.parent !== undefined && ancestors(n.parent).includes(c));
        };
        for (const c of g.containers) for (const n of g.nodes) if (!memberOf(n.id, c.id)) expect(overlaps(n, c), `${where} ${n.id} in ${c.id}`).toBe(false);
        const strips = g.containers.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.head }));
        for (const e of g.edges) expect(e.points.slice(1).some((p, i) => strips.some((s) => hits([e.points[i]!, p], s))), `${where} ${e.id} crosses a label strip`).toBe(false);
      }
    }
    expect(split, 'some departments are split across managers').toBeGreaterThan(5);
  });

  it('routes lines into a box round its label strip, ending on the person', () => {
    for (const direction of ['TB', 'LR'] as const)
      for (const stack of [undefined, 1]) {
        const g = geo({
          direction,
          nodes: [{ id: 'm', shape: 'card', label: 'Manager', ...(stack && { stack }) }, { id: 'h', shape: 'card', label: 'Head', parent: 'd' }, { id: 'x', shape: 'card', label: 'Other' }],
          edges: [
            { id: 'e', from: 'm', to: 'h' },
            { id: 'f', from: 'm', to: 'x' },
          ],
          containers: [{ id: 'd', label: 'A rather long department name' }],
        });
        const d = g.containers[0]!;
        const strip = { x: d.x, y: d.y, w: d.w, h: d.head };
        const e = g.edges.find((x) => x.id === 'e')!.points;
        expect(e.slice(1).some((p, i) => hits([e[i]!, p], strip)), `${direction} ${stack}`).toBe(false);
        const h = g.nodes.find((n) => n.id === 'h')!;
        const end = e.at(-1)!;
        expect(end.x >= h.x - 0.5 && end.x <= h.x + h.w + 0.5 && end.y >= h.y - 0.5 && end.y <= h.y + h.h + 0.5, `${direction} ${stack}`).toBe(true);
      }
  });
});

describe('org chart departments (URS-TYP-012)', () => {
  const chart = (people: object[], extra: object = {}) => ({ version: '1', type: 'orgchart', people, ...extra });
  const codes = (d: unknown) => compile(d, reg).diagnostics.map((x) => [x.severity, x.code, x.path]);

  it('boxes each department, styled and nested as listed', () => {
    const ex = reg.type('orgchart')!.examples.find((e) => e.name === 'departments')!.source;
    const g = compile(ex, reg).ir!;
    expect(g.containers.map((c) => [c.id, c.label, c.parent])).toEqual([
      ['dept0', 'Engineering', undefined],
      ['dept1', 'Product', undefined],
      ['dept2', 'Product Design', 'dept1'],
    ]);
    expect(g.containers[0]!.style).toEqual({ fill: '#eff6ff', stroke: '#93c5fd' });
    expect(g.containers[2]!.style).toEqual({ fill: '#f8fafc' });
    expect(g.nodes.find((n) => n.id === 'd1')!.parent).toBe('dept2');
    expect(render(ex, reg).svg).toContain('Product Design');
    expect(codes(ex)).toEqual([]);
  });

  it('needs no departments list: names on people are enough', () => {
    const g = compile(chart([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', manager: 'a', department: 'Sales' }]), reg).ir!;
    expect(g.containers).toEqual([{ id: 'dept0', label: 'Sales', src: '/people/1/department' }]);
  });

  it('needs no head: people in one department under the same manager share one box, apart from the others', () => {
    const d = chart([
      { id: 'a', name: 'Avery', title: 'Director' },
      { id: 'b', name: 'Blake', manager: 'a', department: 'Payroll' },
      { id: 'x', name: 'Xan', manager: 'a' },
      { id: 'c', name: 'Cass', manager: 'a', department: 'Payroll' },
      { id: 'c1', name: 'Cody', manager: 'c', department: 'Payroll' },
    ]);
    expect(codes(d)).toEqual([]);
    for (const stack of [false, true])
      for (const direction of ['TB', 'LR']) {
        const g = render({ ...d, direction, stack }, reg).geometry!;
        const box = g.containers[0]!;
        const node = (id: string) => g.nodes.find((n) => n.id === id)!;
        for (const id of ['b', 'c', 'c1']) expect(inside(node(id), box), `${direction} ${stack} ${id}`).toBe(true);
        for (const id of ['a', 'x']) expect(overlaps(node(id), box), `${direction} ${stack} ${id}`).toBe(false);
      }
  });

  it('boxes a department in each place its people report into, covering nobody else', () => {
    const split = chart([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', manager: 'a', department: 'Sales' },
      { id: 'c', name: 'C', manager: 'a' },
      { id: 'd', name: 'D', manager: 'c', department: 'Sales' },
    ]);
    expect(codes(split)).toEqual([]);
    for (const direction of ['TB', 'LR']) {
      const r = render({ ...split, direction }, reg);
      const boxes = r.geometry!.containers;
      const node = (id: string) => r.geometry!.nodes.find((n) => n.id === id)!;
      expect(boxes.map((c) => c.id)).toEqual(['dept0', 'dept0']);
      for (const id of ['b', 'd']) expect(boxes.filter((c) => inside(node(id), c)), `${direction} ${id}`).toHaveLength(1);
      for (const id of ['a', 'c']) expect(boxes.some((c) => overlaps(node(id), c)), `${direction} ${id}`).toBe(false);
      // One group in the picture, so selecting the department marks both boxes.
      expect(r.svg!.match(/<g id="c-dept0"[^]*?<\/g>/)![0].match(/<rect/g)).toHaveLength(2);
    }
  });

  it('lets AI generation set departments, which become boxes', () => {
    const ai = reg.type('orgchart')!.ai!;
    expect(ai.guide).toMatch(/department/i);
    const example = ai.examples.find((e) => JSON.stringify(e.output).includes('department'))!;
    const ir = compile(ai.fromGenerated(example.output), reg).ir!;
    expect(ir.containers.map((c) => c.label)).toEqual(['Finance', 'Payroll']);
  });

  it('rejects bad department lists', () => {
    // A department's members include those of departments inside it.
    expect(codes(chart([{ id: 'a', name: 'A', department: 'P' }, { id: 'b', name: 'B', manager: 'a', department: 'Q' }], { departments: [{ name: 'Q', parent: 'P' }] }))).toEqual([]);
    expect(codes(chart([{ id: 'a', name: 'A' }], { departments: [{ name: 'X', parent: 'Nope' }] }))).toEqual([['error', 'ref.department', '/departments/0/parent']]);
    expect(codes(chart([{ id: 'a', name: 'A' }], { departments: [{ name: 'X', parent: 'Y' }, { name: 'Y', parent: 'X' }] })).map((c) => c[1])).toEqual(['orgchart.department', 'orgchart.department']);
    expect(codes(chart([{ id: 'a', name: 'A' }], { departments: [{ name: 'X' }, { name: 'X' }] }))).toEqual([['error', 'orgchart.department', '/departments/1/name']]);
  });
});
