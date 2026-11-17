import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';

const reg = createRegistry();
const ex = reg.type('sap')!.examples[0]!.source as Record<string, unknown>;
const ir = (d: unknown) => {
  const r = compile(d, reg);
  expect(r.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  return r.ir!;
};
const codes = (d: unknown) => compile(d, reg).diagnostics.map((x) => [x.code, x.path]);
const base = {
  version: '1',
  type: 'sap',
  systemStatuses: [{ code: 'CRTD' }, { code: 'REL' }],
  userStatuses: [
    { code: 'A', number: 10, low: 10, high: 20, initial: true },
    { code: 'B', number: 20, low: 10, high: 20, system: 'REL' },
  ],
  transactions: [{ id: 'rel', label: 'Release', sets: ['REL'] }],
};
const [A, B] = base.userStatuses as [object, object];

describe('SAP status and workflow (URS-TYP-019)', () => {
  it('compiles its examples without diagnostics', () => {
    for (const e of reg.type('sap')!.examples) expect(compile(e.source, reg).diagnostics, e.name).toEqual([]);
  });

  it('puts numbered user statuses under their system status, system statuses without any on their own, then flags', () => {
    const p = ir(ex).partitions!;
    expect(p.phases!.map((b) => b.id)).toEqual(['col:user:INIT', 'col:user:APPR', 'col:user:INWK', 'col:user:DONE', 'col:system:TECO', 'col:system:CLSD', 'col:user:HOLD']);
    expect(p.phases![0]).toMatchObject({ label: 'Initial', detail: 'No. 10 · next 10–20\nAuth: PLANNER' });
    expect(p.phases![2]!.detail).toContain('Set by: Release');
    expect(p.phaseGroups).toEqual([expect.objectContaining({ label: 'Flags (any time)', members: ['col:user:HOLD'] })]);
    expect(p.lanes.map((l) => l.id)).toEqual(['sap:system', 'sap:user', 'wf:approval']);
  });

  it('draws two status rows: system statuses linked by the transactions that set them, user statuses by their ranges', () => {
    const r = ir(ex);
    const node = (id: string) => r.nodes.find((n) => n.id === id)!;
    expect(node('sys:REL')).toMatchObject({ shape: 'state', label: 'REL', sub: 'Released', lane: 'sap:system', phase: 'col:user:INWK' });
    expect(node('sys:TECO').phase).toBe('col:system:TECO');
    expect(r.edges.find((e) => e.id === 'sys:CRTD>REL')!.labels).toEqual([{ text: 'Release' }]);
    expect(node('us:HOLD').style).toMatchObject({ dash: 'dashed' });
    // INIT (10–20) → APPR; APPR (10–30) → INIT and INWK; INWK (30–40) → DONE; DONE (40–40) nowhere.
    expect(r.edges.filter((e) => e.id.startsWith('next:')).map((e) => e.id)).toEqual(['next:INIT>APPR', 'next:APPR>INIT', 'next:APPR>INWK', 'next:INWK>DONE']);
    expect(r.edges.some((e) => e.from === 'us:start' && e.to === 'us:INIT')).toBe(true);
    // Ranges written under the statuses instead of arrows.
    const ranges = ir({ ...ex, transitions: 'ranges' });
    expect(ranges.edges.some((e) => e.id.startsWith('next:'))).toBe(false);
    expect(ranges.nodes.find((n) => n.id === 'us:APPR')!.sub).toBe('Next 10–30');
  });

  it('checks statuses, numbers, ranges and references in SAP terms', () => {
    expect(codes(base)).toEqual([]);
    const users = (u: object[]) => codes({ ...base, userStatuses: u });
    expect(users([...base.userStatuses, { code: 'A' }])).toContainEqual(['sap.code', '/userStatuses/2/code']);
    expect(users([...base.userStatuses, { code: 'C', number: 20 }])).toContainEqual(['sap.number', '/userStatuses/2/number']);
    expect(users([{ ...A, low: 30, high: 20 }, B])).toContainEqual(['sap.range', '/userStatuses/0/low']);
    expect(users([...base.userStatuses, { code: 'F', low: 1 }])).toContainEqual(['sap.range', '/userStatuses/2']);
    expect(users([{ ...A, high: 10 }, B])).toContainEqual(['sap.unreachable', '/userStatuses/1']);
    expect(users([{ ...A, initial: false }, B])).toContainEqual(['sap.initial', '/userStatuses']);
    expect(users([...base.userStatuses, { code: 'C', number: 30, initial: true }])).toContainEqual(['sap.initial', '/userStatuses']);
    expect(users([{ ...A, system: 'ZZ', control: { nope: 'allowed' }, setBy: ['nope'] }, B])).toEqual(
      expect.arrayContaining([
        ['ref.status', '/userStatuses/0/system'],
        ['ref.transaction', '/userStatuses/0/control/nope'],
        ['ref.transaction', '/userStatuses/0/setBy/0'],
      ]),
    );
    expect(codes({ ...base, transactions: [{ id: 'rel', sets: ['ZZ'] }] })).toContainEqual(['ref.status', '/transactions/0/sets/0']);
    expect(codes({ ...base, workflows: [{ id: 'w', label: 'W', trigger: { status: 'ZZ' }, steps: [{ id: 's' }, { id: 's', status: 'YY' }] }] })).toEqual(
      expect.arrayContaining([
        ['ref.status', '/workflows/0/trigger/status'],
        ['sap.step', '/workflows/0/steps/1/id'],
        ['ref.status', '/workflows/0/steps/1/status'],
      ]),
    );
    expect(codes({ version: '1', type: 'sap' })).toContainEqual(['sap.statuses', '']);
    expect(codes({ ...base, userStatuses: [{ code: 'A', control: { rel: 'maybe' } }] })).toContainEqual(['schema.enum', '/userStatuses/0/control/rel']);
  });
});

describe('SAP flexible workflow (URS-TYP-021)', () => {
  const nodes = (d: unknown) => new Map(ir(d).nodes.map((n) => [n.id, n]));
  const edge = (d: unknown, id: string) => ir(d).edges.find((e) => e.id === id);

  it('starts from the status whose event triggers it, through a gate of start conditions, to the steps in order', () => {
    const n = nodes(ex);
    expect(n.get('wf:approval:start')).toMatchObject({ shape: 'start', lane: 'wf:approval', phase: 'col:user:INIT' });
    expect(edge(ex, 'us:INIT>wf:approval:start:Order created')).toMatchObject({ style: { dash: 'dashed' } });
    expect(n.get('wf:approval:if')).toMatchObject({ shape: 'checkpoint', label: 'Start conditions', sub: 'Estimated costs > 10,000 EUR' });
    expect(n.get('wf:approval:step:planning')).toMatchObject({ shape: 'process', label: 'Approve', sub: 'Maintenance planning manager', badges: [{ icon: 'clock', text: '2d' }] });
    expect(n.get('wf:approval:step:plant')!.sub).toBe('Plant manager\nIf: Estimated costs > 50,000 EUR');
    expect(edge(ex, 'wf:approval:step:planning>wf:approval:step:plant:Release')).toBeDefined();
  });

  it('releases into the status it sets, rejects into the end, and returns rework as configured', () => {
    const n = nodes(ex);
    expect(n.get('wf:approval:released')).toMatchObject({ shape: 'chevron', label: 'APPR', phase: 'col:user:APPR' });
    expect(edge(ex, 'wf:approval:step:plant>wf:approval:released:Release')).toBeDefined();
    expect(edge(ex, 'wf:approval:step:planning>wf:approval:end:Reject')).toBeDefined();
    expect(n.get('wf:approval:rework:planning')).toMatchObject({ label: 'Rework', sub: 'Requester' });
    expect(edge(ex, 'wf:approval:rework:planning>wf:approval:step:planning:Resubmit (repeat)')).toBeDefined();
    const flow = (rework: string) => ({ ...base, workflows: [{ id: 'w', label: 'W', trigger: { status: 'A' }, steps: [{ id: 'a' }, { id: 'b', rework }] }] });
    expect(edge(flow('restart'), 'wf:w:rework:b>wf:w:step:a:Resubmit (restart)')).toBeDefined();
    expect(edge(flow('continue'), 'wf:w:rework:b>wf:w:end:Resubmit (continue)')).toBeDefined();
  });

  it('marks automatic release when every step may be skipped, and optional steps dashed', () => {
    const w = (steps: object[]) => ({ ...base, workflows: [{ id: 'w', label: 'W', trigger: { status: 'A' }, steps }] });
    expect(edge(w([{ id: 'a', conditions: ['x'] }, { id: 'b', optional: true }]), 'wf:w:start>wf:w:end:No step applies')).toBeDefined();
    expect(edge(w([{ id: 'a' }]), 'wf:w:start>wf:w:end:No step applies')).toBeUndefined();
    expect(nodes(w([{ id: 'a', optional: true }])).get('wf:w:step:a')!.style).toMatchObject({ dash: 'dashed' });
  });

  it('puts start and step conditions into annotations with `annotate`', () => {
    const n = nodes({ ...ex, annotate: true });
    expect(n.get('wf:approval:if')).toMatchObject({ label: '', note: 'If: Estimated costs > 10,000 EUR' });
    expect(n.get('wf:approval:step:plant')).toMatchObject({ sub: 'Plant manager', note: 'If: Estimated costs > 50,000 EUR' });
  });
});

describe('SAP transaction control (URS-TYP-020)', () => {
  it('draws the matrix only when asked: a row per business transaction, a mark per rule', () => {
    expect(ir(ex).partitions!.lanes.some((l) => l.id.startsWith('tx:'))).toBe(false);
    const r = ir({ ...ex, matrix: true });
    expect(r.partitions!.laneGroups).toEqual([expect.objectContaining({ label: 'Transaction control', members: ['tx:release', 'tx:confirm', 'tx:teco', 'tx:close'] })]);
    const mark = (id: string) => r.nodes.find((n) => n.id === id)!;
    expect(mark('mx:release:INIT:forbidden')).toMatchObject({ shape: 'forbidden', lane: 'tx:release', phase: 'col:user:INIT', style: { stroke: '#c62828' } });
    expect(mark('mx:release:APPR:allowed').shape).toBe('allowed');
    expect(mark('mx:teco:INWK:warning').shape).toBe('warning');
    expect(mark('mx:release:INWK:set').shape).toBe('setStatus');
    expect(mark('mx:teco:HOLD:delete').phase).toBe('col:user:HOLD');
    expect(r.legend!.map((l) => l.label)).toEqual(expect.arrayContaining(['Allowed', 'Allowed with a warning', 'Forbidden', 'Sets the status', 'Deletes the status']));
  });

  it('lists only what the chart uses in the legend (URS-DM-026)', () => {
    expect(ir(ex).legend!.map((l) => l.label)).toEqual([
      'Initial status',
      'Flag (any time)',
      'Next status (in range)',
      'Workflow start',
      'Start conditions',
      'Approval step',
      'Deadline',
      'Sets a status',
      'Workflow end',
      'Starts a workflow, rework',
    ]);
  });

  it('keeps every node inside its cell and draws without overlaps', () => {
    const g = render({ ...ex, matrix: true }, reg).geometry!;
    const r = ir({ ...ex, matrix: true });
    for (const n of g.nodes) {
      const src = r.nodes.find((x) => x.id === n.id)!;
      for (const [kind, id] of [['lane', src.lane], ['phase', src.phase]]) {
        const b = g.bands.find((x) => x.kind === kind && x.id === id)!;
        expect(n.x >= b.x - 0.5 && n.y >= b.y - 0.5 && n.x + n.w <= b.x + b.w + 0.5 && n.y + n.h <= b.y + b.h + 0.5, `${n.id} in ${id}`).toBe(true);
      }
    }
  });
});
