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
/** Whole-lifecycle checks (URS-TYP-009) have their own test; the rest of the rules are checked without them. */
const LINT = new Set(['lifecycle.unreachable', 'lifecycle.deadEnd', 'lifecycle.noStateChange']);
const codes = (d: unknown) => compile(d, reg).diagnostics.filter((x) => !LINT.has(x.code)).map((x) => [x.code, x.path]);
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
    expect(nodes.get('r_review')).toMatchObject({ shape: 'process', label: 'Review change', sub: 'QA Reviewer\nComplete: Risk level', phase: 'in_review', lane: 'review' });
    expect(nodes.get('c_fields')).toMatchObject({ shape: 'hexagon', sub: 'Closure date = today' });
    expect(nodes.get('r_approve')).toMatchObject({ shape: 'chevron', label: 'Approved', phase: 'approved' });
    expect(nodes.get('c_split')).toMatchObject({ shape: 'bar', label: '' });
    expect(nodes.get('r_notify')!.shape).toBe('document');
    expect(nodes.get('c_end')).toMatchObject({ shape: 'terminator', label: 'End' });
  });

  it('hangs child records off their state, outside the workflows (URS-TYP-018)', () => {
    const r = ir(ex);
    expect(r.nodes.find((n) => n.id === 'state:approved:record:0')).toMatchObject({ shape: 'record', label: 'Change Action', sub: 'Owner = Change Owner', phase: 'approved', lane: 'lifecycle:actions', src: '/states/2/records/0' });
    expect(r.edges.find((e) => e.id === 'state:approved:record:0:link')).toMatchObject({ from: 'state:approved', to: 'state:approved:record:0', marker: 'none', style: { dash: 'dotted' } });
    // No workflow step makes records any more.
    expect(codes({ ...tiny, workflows: [{ id: 'w', label: 'W', steps: [{ id: 's', kind: 'createRecord', state: 'a' }] }] })).toEqual([['schema.enum', '/workflows/0/steps/0/kind']]);
    const one = (rec: object) => ir({ ...tiny, states: [{ id: 'a', stateType: 'initial', records: [rec] }, { id: 'b' }] }).nodes.find((n) => n.shape === 'record')!;
    expect(one({ record: 'CAPA' })).toMatchObject({ label: 'CAPA' });
    expect(one({ record: 'CAPA', label: 'Open a CAPA' }).label).toBe('Open a CAPA');
    // A record alone brings in the actions band.
    expect(one({ record: 'CAPA' }).lane).toBe('lifecycle:actions');
  });

  it('puts a gate in front of a state that every way in passes (URS-TYP-018)', () => {
    const r = ir(ex);
    expect(r.nodes.find((n) => n.id === 'state:in_review:gate')).toMatchObject({ shape: 'checkpoint', label: 'Gate', sub: 'Required: Description, Impact assessment', phase: 'in_review', src: '/states/1/gate' });
    expect(r.nodes.find((n) => n.id === 'state:in_progress:gate')!.sub).toBe('Change actions assigned');
    expect(r.edges.find((e) => e.id === 'state:in_progress:gate:link')).toMatchObject({ from: 'state:in_progress:gate', to: 'state:in_progress', style: { lineWidth: 2.5 } });
    // User actions end at the gate, not the pill.
    expect(r.edges.find((e) => e.id === 'action:approved:0')!.to).toBe('state:in_progress:gate');
    const gated = (gate: object) => ({ ...tiny, states: [{ id: 'a', stateType: 'initial', gate, to: [{ state: 'b' }] }, { id: 'b', gate: { label: 'QA check', fields: ['X'], criteria: ['Y', 'Z'] } }], sharedActions: [{ state: 'b', from: ['a'] }] });
    const g = ir(gated({ criteria: ['Owner set'] }));
    expect(g.nodes.find((n) => n.id === 'state:b:gate')).toMatchObject({ label: 'QA check', sub: 'Required: X\nY\nZ' });
    expect(g.edges.filter((e) => e.to === 'state:b:gate').map((e) => e.id)).toEqual(['action:a:0', 'shared:0']);
    expect(g.edges.find((e) => e.id === 'state:start:link')!.to).toBe('state:a:gate');
    // Summary transitions end at the gate too.
    const s = ir({ ...ex, view: 'summary' });
    expect(s.edges.find((e) => e.id === 'flow:review:draft:in_review')!.to).toBe('state:in_review:gate');
    expect(s.nodes.some((n) => n.shape === 'checkpoint')).toBe(true);
  });

  it('styles steps by section, then kind, then owner, then their own style (URS-DM-023)', () => {
    const d = {
      ...tiny,
      styles: { steps: { fill: '#111111', stroke: '#111111', text: '#111111' } },
      styleBy: { kind: { task: { fill: '#222222', stroke: '#222222' } }, owner: { Bill: { fill: '#333333' } } },
    };
    const step = (s: object) => ir({ ...d, workflows: [{ id: 'w', label: 'W', steps: [{ id: 's', state: 'a', ...s }] }] }).nodes.find((n) => n.id === 's')!.style;
    expect(step({})).toEqual({ fill: '#222222', stroke: '#222222', text: '#111111' });
    expect(step({ owner: 'Bill' })).toEqual({ fill: '#333333', stroke: '#222222', text: '#111111' });
    expect(step({ owner: 'Bill', style: { fill: '#444444' } })).toMatchObject({ fill: '#444444' });
    expect(step({ kind: 'decision', owner: 'Martha' })).toEqual({ fill: '#111111', stroke: '#111111', text: '#111111' });
    expect(codes({ ...tiny, styleBy: { kind: { nope: {} } } })).toEqual([['schema.additionalProperties', '/styleBy/kind/nope']]);
  });

  it('draws stages over their states, with filler over ungrouped ones, and entry detail under headers (URS-DM-019, URS-DM-020)', () => {
    const g = render(ex, reg).geometry!;
    const band = (kind: string, id: string) => g.bands.find((b) => b.kind === kind && b.id === id)!;
    const exec = band('phaseGroup', 'execution');
    expect(exec.x).toBeCloseTo(band('phase', 'approved').x);
    expect(exec.x + exec.w).toBeCloseTo(band('phase', 'in_progress').x + band('phase', 'in_progress').w);
    expect(exec.y + exec.h).toBeCloseTo(band('phase', 'approved').header.y);
    const ungrouped = render(doc({ stages: [{ id: 'closure', label: 'Closure', states: ['closed'] }] }), reg).geometry!;
    expect(ungrouped.fillers!.map((f) => f.x)).toContainEqual(ungrouped.bands.find((b) => b.kind === 'phase' && b.id === 'cancelled')!.x);
    expect(band('phase', 'in_review').detail).toEqual(['Security: Owner Read · QA', 'Reviewer Edit']);
    expect(render({ ...tiny, states: [{ id: 'a', stateType: 'initial', entryCriteria: ['Impact assessed'] }, { id: 'b' }] }, reg).geometry!.bands.find((b) => b.id === 'a')!.detail).toEqual(['Entry criteria: Impact', 'assessed']);
    const svg = render(ex, reg).svg!;
    expect(svg).toContain('<g id="pg-execution" class="jtd-phaseGroup">');
    expect(svg).toMatch(/class="jtd-detail"[^>]*>Entry actions: Lock record</);
  });

  it('shows the lifecycle actions band with state pills, the initial marker and user actions; it can be toggled', () => {
    const r = ir(ex);
    expect(r.partitions!.lanes[0]).toMatchObject({ id: 'lifecycle:actions', label: 'Lifecycle actions' });
    expect(r.nodes.filter((n) => n.lane === 'lifecycle:actions').map((n) => n.id)).toEqual([
      'state:start',
      'state:draft',
      'state:in_review:gate',
      'state:in_review',
      'state:approved',
      'state:approved:record:0',
      'state:in_progress:gate',
      'state:in_progress',
      'state:closed',
      'state:cancelled',
      'shared:0:from',
    ]);
    expect(r.edges.find((e) => e.id === 'action:approved:0')).toMatchObject({ from: 'state:approved', to: 'state:in_progress:gate', labels: [{ text: 'Start work' }], src: '/states/2/to/0' });
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
    expect(compile(d, reg).diagnostics.filter((x) => !LINT.has(x.code)).map((x) => [x.severity, x.code, x.path])).toEqual([
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
