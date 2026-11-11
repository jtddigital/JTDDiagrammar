import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';

const reg = createRegistry();

describe('port side hints (URS-DM-009)', () => {
  const flow = (edge: object, direction = 'LR') => ({ version: '1', type: 'flowchart', direction, nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', ...edge }] });
  const ends = (d: unknown) => {
    const g = render(d, reg).geometry!;
    const [a, b] = [g.nodes.find((n) => n.id === 'a')!, g.nodes.find((n) => n.id === 'b')!];
    const pts = g.edges[0]!.points;
    return { a, b, first: pts[0]!, last: pts.at(-1)! };
  };

  it.each([
    ['N', (p: { y: number }, n: { y: number }) => p.y === n.y],
    ['S', (p: { y: number }, n: { y: number; h: number }) => p.y === n.y + n.h],
    ['W', (p: { x: number }, n: { x: number }) => p.x === n.x],
  ] as const)('leaves by the hinted side %s', (side, onSide) => {
    const { a, first } = ends(flow({ fromSide: side }));
    expect(onSide(first as never, a as never)).toBe(true);
  });

  it('enters by the hinted side', () => {
    const { b, last } = ends(flow({ toSide: 'S' }));
    expect(last.y).toBe(b.y + b.h);
  });

  it('a hint matching the flow changes nothing', () => {
    expect(render(flow({ fromSide: 'E', toSide: 'W' }), reg).svg).toBe(render(flow({}), reg).svg);
  });

  it('rejects unknown sides', () => {
    expect(compile(flow({ fromSide: 'up' }), reg).diagnostics.map((d) => d.code)).toEqual(['schema.enum']);
  });
});

describe('notes (URS-DM-012)', () => {
  const doc = { version: '1', type: 'flowchart', nodes: [{ id: 'a' }], notes: [{ text: 'Why', for: 'a' }, { id: 'free', text: 'Loose' }] };

  it('draws attached notes with a dotted, arrowless link', () => {
    const g = render(doc, reg).geometry!;
    expect(g.nodes.map((n) => [n.id, n.shape])).toEqual([['a', 'process'], ['note:0', 'note'], ['free', 'note']]);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ from: 'a', to: 'note:0', marker: 'none', style: { dash: 'dotted' } });
    const svg = render(doc, reg).svg!;
    expect(svg).toMatch(/<g id="e-note:0:link" class="jtd-edge"><path [^>]*stroke-dasharray="1.5 3"[^>]*\/>/);
    expect(svg.match(/<g id="e-note:0:link"[^]*?<\/g>/)![0]).not.toContain('marker-end');
  });

  it('reports a note attached to an unknown node at the note', () => {
    const d = { ...doc, notes: [{ text: 'x', for: 'ghost' }] };
    expect(compile(d, reg).diagnostics.map((x) => [x.code, x.path])).toEqual([['ref.edge', '/notes/0']]);
  });

  it('puts attached notes in their node’s lane', () => {
    const d = { version: '1', type: 'flowchart', lanes: [{ id: 'l', label: 'L' }], nodes: [{ id: 'a', lane: 'l' }], notes: [{ text: 'n', for: 'a' }] };
    expect(compile(d, reg).diagnostics).toEqual([]);
  });
});

describe('org chart (URS-TYP-006)', () => {
  const org = (people: object[]) => ({ version: '1', type: 'orgchart', people });

  it('renders people as cards with name and title, managers above reports', () => {
    const g = render(org([{ id: 'b', name: 'Boss', title: 'CEO' }, { id: 'r', name: 'Report', manager: 'b' }]), reg).geometry!;
    const [b, r] = [g.nodes.find((n) => n.id === 'b')!, g.nodes.find((n) => n.id === 'r')!];
    expect(b.lines).toEqual(['Boss', 'CEO']);
    expect(b.y).toBeLessThan(r.y);
    expect(g.edges[0]).toMatchObject({ from: 'b', to: 'r', marker: 'none' });
  });

  it('rejects reporting cycles and unknown managers', () => {
    const codes = (p: object[]) => compile(org(p), reg).diagnostics.map((d) => [d.code, d.path]);
    expect(codes([{ id: 'a', name: 'A', manager: 'b' }, { id: 'b', name: 'B', manager: 'a' }])).toEqual([
      ['orgchart.cycle', '/people/0/manager'],
      ['orgchart.cycle', '/people/1/manager'],
    ]);
    expect(codes([{ id: 'a', name: 'A', manager: 'ghost' }])).toEqual([['ref.edge', '/people/0/manager']]);
  });
});
