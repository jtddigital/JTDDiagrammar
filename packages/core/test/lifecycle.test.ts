import { describe, expect, it } from 'vitest';
import type { Box, GraphIR } from '../src/index.ts';
import { compile, createRegistry, render } from '../src/index.ts';
import { validateIR } from '../src/validate/common.ts';

const reg = createRegistry();
const ex = reg.type('lifecycle')!.examples[0]!.source as Record<string, unknown>;
const doc = (over: object = {}) => ({ ...ex, ...over });
const ir = (d: unknown) => {
  const r = compile(d, reg);
  expect(r.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  return r.ir!;
};
const codes = (d: unknown) => compile(d, reg).diagnostics.map((x) => [x.code, x.path]);
const inside = (o: Box, b: Box) => b.x >= o.x - 0.5 && b.y >= o.y - 0.5 && b.x + b.w <= o.x + o.w + 0.5 && b.y + b.h <= o.y + o.h + 0.5;

const tiny = {
  version: '1',
  type: 'lifecycle',
  states: [{ id: 'a', stateType: 'initial' }, { id: 'b' }],
  workflows: [{ id: 'w', label: 'W', steps: [{ id: 's', kind: 'start', state: 'a', to: [{ step: 'go' }] }, { id: 'go', kind: 'stateChange', target: 'b' }] }],
};

describe('lifecycle type (URS-TYP-008)', () => {
  it('compiles its examples without diagnostics', () => {
    for (const e of reg.type('lifecycle')!.examples) expect(compile(e.source, reg).diagnostics, e.name).toEqual([]);
  });

  it.each([
    ['columns', 'LR', 'phases'],
    ['columns', 'TB', 'lanes'],
    ['rows', 'LR', 'lanes'],
    ['rows', 'TB', 'phases'],
  ])('statesAs %s with direction %s puts states on %s; workflows take the other axis', (statesAs, direction, axis) => {
    const p = ir({ ...tiny, statesAs, direction }).partitions!;
    const [states, workflows] = axis === 'phases' ? [p.phases, p.lanes] : [p.lanes, p.phases];
    expect(states!.map((b) => b.id)).toEqual(['a', 'b']);
    expect(workflows!.map((b) => b.id)).toEqual(['w']);
    // The flow itself follows `direction`.
    const g = render({ ...tiny, statesAs, direction }, reg).geometry!;
    const [s, go] = ['s', 'go'].map((id) => g.nodes.find((n) => n.id === id)!);
    expect(direction === 'LR' ? go!.x > s!.x : go!.y > s!.y).toBe(true);
  });

  it('maps steps to shapes and states, defaulting labels; state changes sit in their target state', () => {
    const nodes = new Map(ir(ex).nodes.map((n) => [n.id, n]));
    expect(nodes.get('r_review')).toMatchObject({ shape: 'process', label: 'Review change\nQA Reviewer', phase: 'in_review', lane: 'review' });
    expect(nodes.get('r_approve')).toMatchObject({ shape: 'chevron', label: '→ Approved', phase: 'approved' });
    expect(nodes.get('r_ok')!.shape).toBe('decision');
    expect(nodes.get('r_notify')!.shape).toBe('document');
    expect(nodes.get('c_end')).toMatchObject({ shape: 'terminator', label: 'End' });
  });

  it('draws stages over their states, with filler over ungrouped ones, and entry detail under headers (URS-DM-019, URS-DM-020)', () => {
    const g = render(ex, reg).geometry!;
    const band = (kind: string, id: string) => g.bands.find((b) => b.kind === kind && b.id === id)!;
    const exec = band('phaseGroup', 'execution');
    expect(exec.x).toBeCloseTo(band('phase', 'approved').x);
    expect(exec.x + exec.w).toBeCloseTo(band('phase', 'in_progress').x + band('phase', 'in_progress').w);
    expect(exec.y + exec.h).toBeCloseTo(band('phase', 'approved').header.y);
    expect(g.fillers).toHaveLength(1);
    expect(g.fillers![0]!.x).toBeCloseTo(band('phase', 'cancelled').x);
    expect(band('phase', 'in_review').detail).toEqual(['Entry criteria: Impact', 'assessed']);
    const svg = render(ex, reg).svg!;
    expect(svg).toContain('<g id="pg-execution" class="jtd-phaseGroup">');
    expect(svg).toMatch(/class="jtd-detail"[^>]*>Entry actions: Lock record</);
  });

  it('shows the lifecycle actions band with state pills, the initial marker and user actions; it can be toggled', () => {
    const r = ir(ex);
    expect(r.partitions!.lanes[0]).toMatchObject({ id: 'lifecycle:actions', label: 'Lifecycle actions' });
    expect(r.nodes.filter((n) => n.lane === 'lifecycle:actions').map((n) => n.id)).toEqual(['state:start', 'state:draft', 'state:in_review', 'state:approved', 'state:in_progress', 'state:closed', 'state:cancelled']);
    expect(r.edges.find((e) => e.id === 'action:draft:0')).toMatchObject({ from: 'state:draft', to: 'state:cancelled', label: 'Cancel', src: '/states/0/to/0' });
    expect(ir(doc({ actionsLane: false })).partitions!.lanes.map((l) => l.id)).toEqual(['review', 'closure']);
    expect(ir({ ...tiny, actionsLane: true }).nodes.some((n) => n.id === 'state:b')).toBe(true);
    expect(ir(tiny).nodes.some((n) => n.id.startsWith('state:'))).toBe(false);
  });

  it('keeps every step, pill and callout inside its cell, in all orientations', () => {
    for (const [statesAs, direction] of [['columns', 'LR'], ['rows', 'TB'], ['rows', 'LR'], ['columns', 'TB']]) {
      const d = doc({ statesAs, direction });
      const g = render(d, reg).geometry!;
      const r = ir(d);
      for (const n of g.nodes) {
        const src = r.nodes.find((x) => x.id === n.id)!;
        for (const [kind, id] of [['lane', src.lane], ['phase', src.phase]]) expect(inside(g.bands.find((b) => b.kind === kind && b.id === id)!, n), `${statesAs}/${direction} ${n.id} in ${id}`).toBe(true);
      }
    }
  });

  it('reports lifecycle problems once, in lifecycle terms', () => {
    expect(codes({ ...tiny, states: [{ id: 'a', stateType: 'initial' }, { id: 'b', stateType: 'initial' }] })).toEqual([['lifecycle.initial', '/states/1/stateType']]);
    expect(codes({ ...tiny, states: [{ id: 'a' }, { id: 'b' }] })).toEqual([['lifecycle.initial', '/states']]);
    const steps = (s: object[]) => ({ ...tiny, workflows: [{ id: 'w', label: 'W', steps: [{ id: 's', kind: 'start', state: 'a', to: s.map((_, i) => ({ step: `x${i}` })) }, ...s.map((x, i) => ({ id: `x${i}`, ...x }))] }] });
    expect(codes(steps([{ state: 'zz' }]))).toEqual([['ref.state', '/workflows/0/steps/1/state']]);
    expect(codes(steps([{ kind: 'stateChange' }]))).toEqual([
      ['lifecycle.target', '/workflows/0/steps/1'],
      ['lifecycle.state', '/workflows/0/steps/1'],
    ]);
    expect(codes(steps([{ kind: 'stateChange', target: 'zz' }]))).toEqual([['ref.state', '/workflows/0/steps/1/target']]);
    expect(codes({ ...tiny, states: [{ id: 'a', stateType: 'initial', to: [{ state: 'zz' }] }, { id: 'b' }] })).toEqual([['ref.state', '/states/0/to/0/state']]);
  });

  it('checks stages: known, unshared and adjacent states', () => {
    const states = [{ id: 'a', stateType: 'initial' }, { id: 'b' }, { id: 'c' }];
    const st = (stages: object[]) => codes({ ...tiny, states, stages });
    expect(st([{ id: 'g', label: 'G', states: ['a', 'zz'] }])).toEqual([['lifecycle.stage', '/stages/0']]);
    expect(st([{ id: 'g', label: 'G', states: ['a', 'c'] }])).toEqual([['lifecycle.stage', '/stages/0']]);
    expect(st([{ id: 'g', label: 'G', states: ['a'] }, { id: 'h', label: 'H', states: ['a', 'b'] }])).toEqual([['lifecycle.stage', '/stages/1']]);
  });

  it('warns about workflows without one start and about unreachable steps', () => {
    const d = { ...tiny, workflows: [{ id: 'w', label: 'W', steps: [{ id: 's', kind: 'start', state: 'a' }, { id: 'lost', state: 'b' }] }, { id: 'v', label: 'V', steps: [{ id: 't', state: 'a' }] }] };
    expect(compile(d, reg).diagnostics.map((x) => [x.severity, x.code, x.path])).toEqual([
      ['warning', 'lifecycle.reach', '/workflows/0/steps/1'],
      ['warning', 'lifecycle.start', '/workflows/1'],
    ]);
  });
});

describe('band groups (URS-DM-019)', () => {
  const base = (groups: GraphIR['partitions']): GraphIR => ({ direction: 'LR', nodes: [], edges: [], containers: [], partitions: groups });
  const lanes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
  const check = (laneGroups: { id: string; label: string; members: string[] }[]) => validateIR(base({ lanes, laneGroups })).map((d) => d.code);

  it('requires known, unshared, adjacent members in band order', () => {
    expect(check([{ id: 'g', label: 'G', members: ['a', 'b'] }])).toEqual([]);
    expect(check([{ id: 'g', label: 'G', members: ['a', 'x'] }])).toEqual(['ref.group']);
    expect(check([{ id: 'g', label: 'G', members: ['a', 'c'] }])).toEqual(['group.adjacent']);
    expect(check([{ id: 'g', label: 'G', members: ['b', 'a'] }])).toEqual(['group.adjacent']);
    expect(check([{ id: 'g', label: 'G', members: ['a'] }, { id: 'h', label: 'H', members: ['a', 'b'] }])).toEqual(['group.overlap']);
  });

  it('widens members so a long group label fits', () => {
    const d = { ...tiny, stages: [{ id: 'g', label: 'A rather long lifecycle stage name over two short states', states: ['a', 'b'] }] };
    const g = render(d, reg).geometry!;
    const grp = g.bands.find((b) => b.kind === 'phaseGroup')!;
    expect(grp.lines.length).toBe(1);
    expect(grp.w).toBeGreaterThan(300);
  });
});
