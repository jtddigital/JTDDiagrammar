import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';
import type { Sap } from '../src/diagrams/sap/model.ts';

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

describe('SAP annotations (URS-DM-029)', () => {
  it('names what each annotation is attached to, by code or label, only when asked', () => {
    const on = (annotationTarget?: string) => {
      const n = new Map(ir({ ...ex, annotate: true, ...(annotationTarget && { annotationTarget }) }).nodes.map((x) => [x.id, x.noteOn]));
      return ['sys:CLSD', 'wf:approval:if', 'wf:approval:step:plant'].map((id) => n.get(id));
    };
    expect(on()).toEqual([undefined, undefined, undefined]);
    expect(on('id')).toEqual(['CLSD', 'approval', 'plant']);
    expect(on('label')).toEqual(['Closed', 'Order approval (start conditions)', 'Approve (Plant manager)']);
    expect(render({ ...ex, annotationTarget: 'label' }, reg).svg).toMatch(/font-weight="bold">Closed<\/text>/);
  });
});

describe('SAP annotation groups (URS-DM-030)', () => {
  it('groups by type, owner (the step recipients) and tag', () => {
    const groups = (annotationGroups: string[]) => new Map(ir({ ...ex, annotate: true, annotationGroups }).nodes.filter((n) => n.note).map((n) => [n.id, n.noteGroups]));
    const g = groups(['type', 'owner']);
    expect(g.get('wf:approval:step:plant')).toEqual([['Approval step'], ['Plant manager']]);
    expect(g.get('sys:CLSD')).toEqual([['System status'], ['No owner']]);
    expect(g.get('wf:approval:if')).toEqual([['Start conditions'], ['No owner']]);
    const t = ir({ ...reg.type('sap')!.examples[1]!.source as object });
    expect(t.nodes.find((n) => n.id === 'wf:approval:step:plant')!.noteGroups).toEqual([['Cost control', 'Compliance']]);
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
      'Start or release conditions',
      'Approval step, release code',
      'Deadline',
      'Sets a status',
      'Workflow end, released',
      'Starts a workflow or strategy, rework',
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

describe('SAP document flow (URS-TYP-023)', () => {
  const flow = reg.type('sap')!.examples.find((e) => e.name === 'document-flow')!.source as Record<string, unknown>;

  it('places each document in the status it is created in, else after the one it follows, linked both ways', () => {
    const r = ir(flow);
    const node = (id: string) => r.nodes.find((n) => n.id === id)!;
    expect(r.partitions!.lanes.map((l) => l.id)).toEqual(['sap:system', 'sap:user', 'sap:documents', 'rs:z1']);
    expect(node('doc:pr')).toMatchObject({ shape: 'document', label: 'Purchase requisition', sub: 'Non-stock components', lane: 'sap:documents', phase: 'col:user:INWK' });
    expect(node('doc:gr').phase).toBe('col:user:INWK');
    expect(node('doc:settle').phase).toBe('col:system:TECO');
    expect(r.edges.find((e) => e.id === 'sys:REL>doc:pr')).toMatchObject({ marker: 'none', style: { dash: 'dotted' } });
    expect(r.edges.filter((e) => e.to.startsWith('doc:') && !e.marker).map((e) => e.id)).toEqual(['doc:pr>doc:po', 'doc:po>doc:gr', 'doc:gr>doc:settle']);
  });

  it('checks document references and loops', () => {
    const docs = (documents: object[]) => codes({ ...base, documents });
    expect(docs([{ id: 'a', label: 'A', status: 'ZZ', from: ['nope'] }])).toEqual(
      expect.arrayContaining([
        ['ref.status', '/documents/0/status'],
        ['ref.document', '/documents/0/from/0'],
      ]),
    );
    expect(docs([{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }])).toContainEqual(['sap.document', '/documents/1/id']);
    expect(docs([{ id: 'a', label: 'A', from: ['b'] }, { id: 'b', label: 'B', from: ['a'] }])).toContainEqual(['sap.documentLoop', '/documents/0']);
  });
});

describe('SAP release strategy (URS-TYP-022)', () => {
  const flow = reg.type('sap')!.examples.find((e) => e.name === 'document-flow')!.source as Record<string, unknown>;
  const edge = (d: unknown, id: string) => ir(d).edges.find((e) => e.id === id);

  it('starts from the document it releases, through its release conditions, releasing codes after their prerequisites', () => {
    const r = ir(flow);
    const node = (id: string) => r.nodes.find((n) => n.id === id)!;
    expect(edge(flow, 'doc:pr>rs:z1:start:Release strategy')).toMatchObject({ style: { dash: 'dashed' } });
    expect(node('rs:z1:start').phase).toBe('col:user:INWK');
    expect(node('rs:z1:if')).toMatchObject({ shape: 'checkpoint', label: 'Release conditions', sub: 'Total value > 10,000 EUR\nPlant 1000' });
    expect(node('rs:z1:code:P1')).toMatchObject({ shape: 'process', label: 'Purchasing manager', sub: 'Release code P1\nIndicator: Blocked, changeable' });
    // P1 first; F1 and Q1 after it, in parallel; both last, so both release the document.
    expect(edge(flow, 'rs:z1:if>rs:z1:code:P1')).toBeDefined();
    expect(edge(flow, 'rs:z1:code:P1>rs:z1:code:F1:Release')).toBeDefined();
    expect(edge(flow, 'rs:z1:code:P1>rs:z1:code:Q1:Release')).toBeDefined();
    expect(edge(flow, 'rs:z1:code:P1>rs:z1:end:Release')).toBeUndefined();
    expect(edge(flow, 'rs:z1:code:F1>rs:z1:end:Release')).toBeDefined();
    expect(edge(flow, 'rs:z1:if>rs:z1:end:Conditions not met')).toMatchObject({ style: { dash: 'dashed' } });
    expect(r.legend!.map((l) => l.label)).toEqual(expect.arrayContaining(['Document', 'Created in status', 'Start or release conditions']));
  });

  it('checks release codes: unique, at most eight, known prerequisites, no loops', () => {
    const rs = (codes_: object[], extra: object = {}) => codes({ ...base, releaseStrategies: [{ id: 'z', label: 'Z', codes: codes_, ...extra }] });
    expect(rs([{ code: 'A1' }, { code: 'A1' }])).toContainEqual(['sap.releaseCode', '/releaseStrategies/0/codes/1/code']);
    expect(rs([{ code: 'A1', prerequisites: ['A1', 'B9'] }])).toEqual(
      expect.arrayContaining([
        ['sap.releaseCode', '/releaseStrategies/0/codes/0/prerequisites/0'],
        ['ref.releaseCode', '/releaseStrategies/0/codes/0/prerequisites/1'],
      ]),
    );
    expect(rs([{ code: 'A1', prerequisites: ['B1'] }, { code: 'B1', prerequisites: ['A1'] }])).toContainEqual(['sap.releaseOrder', '/releaseStrategies/0/codes']);
    expect(rs(Array.from({ length: 9 }, (_, i) => ({ code: `C${i}` })))).toContainEqual(['schema.maxItems', '/releaseStrategies/0/codes']);
    expect(rs([{ code: 'A1' }], { document: 'nope' })).toContainEqual(['ref.document', '/releaseStrategies/0/document']);
    expect(rs([{ code: 'TOO' }])).toContainEqual(['schema.pattern', '/releaseStrategies/0/codes/0/code']);
  });
});

describe('SAP follow-ons (URS-TYP-025..027)', () => {
  const example = (name: string) => structuredClone(reg.type('sap')!.examples.find((e) => e.name === name)!.source) as Sap;

  it('TYP-025: a release code that can reject leads to the requester, who resubmits to the start', () => {
    const g = ir(example('purchase-requisition'));
    const by = (from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);
    expect(g.nodes.find((n) => n.id === 'rs:s1:rejected')).toMatchObject({ shape: 'process', label: 'Rejected', sub: 'Requester changes and resubmits' });
    expect(by('rs:s1:code:10', 'rs:s1:rejected')!.labels).toEqual([{ text: 'Reject' }]);
    expect(by('rs:s1:code:20', 'rs:s1:rejected')!.labels).toEqual([{ text: 'Reject' }]);
    expect(by('rs:s1:rejected', 'rs:s1:start')).toMatchObject({ labels: [{ text: 'Resubmit' }], style: { dash: 'dashed' } });
    // Without `reject`, no rejection is drawn.
    const plain = example('purchase-requisition');
    for (const c of plain.releaseStrategies![0]!.codes) delete c.reject;
    expect(ir(plain).nodes.some((n) => n.id === 'rs:s1:rejected')).toBe(false);
  });

  it('TYP-026: transaction codes follow the transaction on arrows and in the matrix, and sit under a step', () => {
    const g = ir(example('transaction-control'));
    expect(g.edges.find((e) => e.id === 'sys:CRTD>REL')!.labels).toEqual([{ text: 'Release (IW32)' }]);
    expect(g.partitions!.lanes.find((l) => l.id === 'tx:confirm')!.detail).toBe('confirm\nIW41, F1606');
    expect(g.nodes.find((n) => n.id === 'wf:approval:step:planning')!.sub).toBe('Maintenance planning manager\nMy Inbox');
    const plain = ir({ ...base, transactions: [{ id: 'rel', tcodes: ['IW32'], sets: ['REL'] }], matrix: true });
    expect(plain.partitions!.lanes.find((l) => l.id === 'tx:rel')!.detail).toBe('IW32');
  });

  it('TYP-027: without statuses, each document is a column and the chart has no diagnostics', () => {
    const r = compile(example('purchase-requisition'), reg);
    expect(r.diagnostics).toEqual([]);
    expect(r.ir!.partitions!.phases!.map((p) => [p.id, p.label])).toEqual([
      ['col:doc:pr', 'Purchase requisition'],
      ['col:doc:po', 'Purchase order'],
      ['col:doc:gr', 'Goods receipt'],
      ['col:doc:iv', 'Supplier invoice'],
    ]);
    expect(r.ir!.nodes.filter((n) => n.lane?.startsWith('rs:')).every((n) => n.phase === 'col:doc:pr')).toBe(true);
    // Statuses or documents: a chart needs one or the other.
    expect(codes({ version: '1', type: 'sap', releaseStrategies: [] })).toContainEqual(['sap.statuses', '']);
  });
});
