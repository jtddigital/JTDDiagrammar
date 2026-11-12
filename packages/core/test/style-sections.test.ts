import { describe, expect, it } from 'vitest';
import type { Box, Geometry } from '../src/index.ts';
import { compile, createRegistry, parseXml, render } from '../src/index.ts';

const reg = createRegistry();
const geo = (d: unknown): Geometry => {
  const r = render(d, reg);
  expect(r.diagnostics).toEqual([]);
  return r.geometry!;
};
const svg = (d: unknown) => render(d, reg).svg!;
const ir = (d: unknown) => compile(d, reg).ir!;
const inside = (o: Box, b: Box) => b.x >= o.x - 0.5 && b.y >= o.y - 0.5 && b.x + b.w <= o.x + o.w + 0.5 && b.y + b.h <= o.y + o.h + 0.5;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const flow = {
  version: '1',
  type: 'flowchart',
  styles: { nodes: { fill: '#eff6ff', stroke: '#1d4ed8' }, lanes: { fill: '#f1f5f9' }, phases: { text: '#334155' }, notes: { fill: '#fff7ed' } },
  edgeStyle: { stroke: '#475569', dash: 'dashed' },
  lanes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', style: { fill: '#fef3c7' } }],
  phases: [{ id: 'p', label: 'P' }],
  nodes: [
    { id: 'x', lane: 'a', phase: 'p', to: [{ node: 'y' }] },
    { id: 'y', lane: 'b', phase: 'p', style: { fill: '#dcfce7' }, to: [{ node: 'x', style: { dash: 'solid' } }] },
  ],
  notes: [{ for: 'x', text: 'n' }],
};

describe('section styles (URS-DM-015)', () => {
  it('applies each section default and lets items override it field by field', () => {
    const r = ir(flow);
    expect(r.nodes.find((n) => n.id === 'x')!.style).toEqual({ fill: '#eff6ff', stroke: '#1d4ed8' });
    expect(r.nodes.find((n) => n.id === 'y')!.style).toEqual({ fill: '#dcfce7', stroke: '#1d4ed8' });
    expect(r.nodes.find((n) => n.shape === 'note')!.style).toEqual({ fill: '#fff7ed' });
    expect(r.edges[0]!.style).toEqual({ stroke: '#475569', dash: 'dashed' });
    expect(r.edges[1]!.style).toEqual({ stroke: '#475569', dash: 'solid' });
    expect(r.partitions!.lanes.map((l) => l.style)).toEqual([{ fill: '#f1f5f9' }, { fill: '#fef3c7' }]);
    expect(r.partitions!.phases![0]!.style).toEqual({ text: '#334155' });
  });

  it('works for state diagrams and org charts', () => {
    const s = ir({ version: '1', type: 'state', styles: { states: { fill: '#fef3c7' } }, transitionStyle: { stroke: '#dc2626' }, states: [{ id: 'c', states: [{ id: 'x', style: { stroke: '#000000' } }], to: [{ state: 'x' }] }] });
    expect(s.containers[0]!.style).toEqual({ fill: '#fef3c7' });
    expect(s.nodes[0]!.style).toEqual({ fill: '#fef3c7', stroke: '#000000' });
    expect(s.edges[0]!.style).toEqual({ stroke: '#dc2626' });
    const o = ir({ version: '1', type: 'orgchart', styles: { people: { fill: '#e0f2fe' }, lines: { stroke: '#64748b' } }, people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', manager: 'a' }] });
    expect(o.nodes.map((n) => n.style)).toEqual([{ fill: '#e0f2fe' }, { fill: '#e0f2fe' }]);
    expect(o.edges[0]!.style).toEqual({ stroke: '#64748b' });
  });

  it('rejects unknown sections and invalid defaults', () => {
    const d = compile({ ...flow, styles: { boxes: {}, nodes: { fill: 'red' } } }, reg).diagnostics.map((x) => x.path).sort();
    expect(d).toEqual(['/styles/boxes', '/styles/nodes/fill']);
  });

  it('reads section styles from XML', () => {
    const doc = parseXml('<diagram version="1" type="flowchart"><styles><nodes fill="#eff6ff" lineWidth="2"/></styles><nodes><node id="a"/></nodes></diagram>', reg);
    expect(ir(doc.value).nodes[0]!.style).toEqual({ fill: '#eff6ff', lineWidth: 2 });
  });

  it('survives AI refinement', () => {
    const t = reg.type('flowchart')!;
    const prev = t.ai.fromGenerated(t.ai.toGenerated(flow)) as typeof flow;
    expect(t.ai.merge({ ...flow }, prev)).toMatchObject({ styles: flow.styles });
  });
});

const one = (style: object, to: object[] = [{ node: 'b' }], back: object[] = []) => ({ version: '1', type: 'flowchart', nodes: [{ id: 'a', label: 'Approve the purchase order', style, to }, { id: 'b', to: back }] });

describe('more style options (URS-DM-016)', () => {
  it('sizes nodes for their font and draws size, weight and slant', () => {
    const [plain, big] = [geo(one({})).nodes[0]!, geo(one({ fontSize: 20, bold: true })).nodes[0]!];
    // The larger font wraps sooner, so the node grows taller.
    expect(big.h).toBeGreaterThan(plain.h);
    expect(svg(one({ fontSize: 20, bold: true, italic: true }))).toMatch(/<text [^>]*font-size="20" font-weight="bold" font-style="italic"/);
  });

  it('styles edge labels, band headers and container headers', () => {
    expect(svg(one({}, [{ node: 'b', label: 'ok', style: { fontSize: 16, labelFill: '#fef9c3' } }]))).toMatch(/fill="#fef9c3"\/><text [^>]*font-size="16"[^>]*>ok</);
    const lanes = { version: '1', type: 'flowchart', lanes: [{ id: 'l', label: 'Lane', style: { fontSize: 20, bold: false } }], nodes: [{ id: 'a', lane: 'l' }] };
    expect(svg(lanes)).toMatch(/font-size="20"[^>]*>Lane</);
    const state = (fontSize?: number) => ({ version: '1', type: 'state', states: [{ id: 'c', label: 'Composite', ...(fontSize && { style: { fontSize } }), states: [{ id: 'x' }] }] });
    const [small, large] = [geo(state()).containers[0]!, geo(state(24)).containers[0]!];
    expect(large.head).toBeGreaterThan(small.head);
    expect(geo(state(24)).nodes[0]!.y).toBeGreaterThanOrEqual(large.y + large.head);
  });

  it('applies opacity and arrowhead shapes', () => {
    const out = svg(one({ opacity: 0.4 }, [{ node: 'b', style: { arrowhead: 'diamond' } }], [{ node: 'a', style: { arrowhead: 'none' } }]));
    expect(out).toContain('<g id="n-a" class="jtd-node jtd-shape-process" transform="translate(');
    expect(out).toMatch(/<g id="n-a"[^>]*opacity="0.4"/);
    expect(out).toContain('marker-end="url(#jtd-arrow-diamond)"');
    expect(out.match(/<g id="e-edge:b:0"[^]*?<\/g>/)![0]).not.toContain('marker-end');
    for (const head of ['open', 'circle']) expect(svg(one({}, [{ node: 'b', style: { arrowhead: head } }]))).toContain(`<marker id="jtd-arrow-${head}"`);
  });

  it('rejects out-of-range values', () => {
    const bad = [{ fontSize: 4 }, { opacity: 2 }, { arrowhead: 'star' }, { bold: 'yes' }, { width: 5 }, { label: 'outside' }];
    for (const style of bad) expect(compile(one(style), reg).diagnostics).toHaveLength(1);
  });
});

const callouts = (label: string, extra: object = {}) => ({
  version: '1',
  type: 'flowchart',
  styles: { nodes: { label } },
  lanes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  nodes: [
    { id: 's', label: 'Go', lane: 'a', to: [{ node: 'l' }] },
    { id: 'l', label: 'A rather long label that will never fit inside a standard node', lane: 'a', to: [{ node: 'd' }] },
    { id: 'd', shape: 'decision', label: 'Within policy for this quarter?', lane: 'b', to: [{ node: 'e', label: 'yes' }] },
    { id: 'e', label: 'End', lane: 'b' },
  ],
  ...extra,
});

describe('fixed-size nodes and callouts (URS-DM-017)', () => {
  it('callout: every node of a shape has the standard size, labels go beside them', () => {
    const g = geo(callouts('callout'));
    const boxes = g.nodes.filter((n) => n.shape === 'process');
    expect(new Set(boxes.map((n) => `${n.w}x${n.h}`)).size).toBe(1);
    for (const n of g.nodes) {
      expect(n.lines, n.id).toEqual([]);
      expect(n.callout, n.id).toBeDefined();
    }
  });

  it('auto: short labels stay inside, long ones move to a callout', () => {
    const g = geo(callouts('auto'));
    const by = new Map(g.nodes.map((n) => [n.id, n]));
    expect(by.get('s')!.lines).toEqual(['Go']);
    expect(by.get('s')!.callout).toBeUndefined();
    expect(by.get('l')!.callout?.lines.join(' ')).toBe('A rather long label that will never fit inside a standard node');
  });

  it('places callouts clear of nodes and other labels, inside their lane, joined by a leader', () => {
    for (const direction of ['LR', 'TB']) {
      const g = geo(callouts('callout', { direction }));
      const labels = g.edges.flatMap((e) => (e.label ? [e.label] : []));
      for (const n of g.nodes) {
        const c = n.callout!;
        for (const m of g.nodes) expect(overlap(c, m), `${direction} ${n.id} callout vs ${m.id}`).toBe(false);
        for (const l of labels) expect(overlap(c, l), `${direction} ${n.id} callout vs label`).toBe(false);
        const lane = g.bands.find((b) => b.kind === 'lane' && inside(b, n))!;
        expect(inside(lane, c), `${direction} ${n.id} callout in its lane`).toBe(true);
        const [from, to] = c.leader;
        expect(inside({ ...n, x: n.x - 0.5, y: n.y - 0.5, w: n.w + 1, h: n.h + 1 }, { ...from, w: 0, h: 0 })).toBe(true);
        expect(inside(c, { ...to, w: 0, h: 0 })).toBe(true);
      }
    }
  });

  it('keeps callouts inside composite states', () => {
    const g = geo({ version: '1', type: 'state', styles: { states: { label: 'callout' } }, states: [{ id: 'c', states: [{ id: 'x', label: 'A long description of a nested state', to: [{ state: 'y' }] }, { id: 'y', label: 'Another long nested state label' }] }] });
    for (const n of g.nodes) expect(inside(g.containers[0]!, n.callout!)).toBe(true);
  });

  it('honours a fixed width and height, and leaves pseudostates alone', () => {
    const n = geo(one({ width: 140, height: 60 })).nodes[0]!;
    expect([n.w, n.h]).toEqual([140, 60]);
    const s = geo({ version: '1', type: 'state', styles: { states: { width: 140, height: 60, label: 'callout' } }, states: [{ id: 'i', kind: 'initial', to: [{ state: 'x' }] }, { id: 'x' }] });
    expect(s.nodes.find((x) => x.id === 'i')!.w).toBe(18);
  });

  it('draws the callout with its leader inside the node group', () => {
    const out = svg(callouts('callout'));
    const l = out.match(/<g id="n-l"[^]*?<\/g>/)![0];
    expect(l).toMatch(/<path d="M[-\d. ]+L[-\d. ]+" fill="none" stroke="#[0-9a-f]+" stroke-width="1"\/><rect [^>]*rx="4"/);
    expect(l).toContain('>A rather long label that</text>');
  });
});
