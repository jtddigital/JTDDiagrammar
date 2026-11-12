import { describe, expect, it } from 'vitest';
import type { GraphIR } from '../src/index.ts';
import { compile, createRegistry, render } from '../src/index.ts';

const reg = createRegistry();
const ex = (name: string) => reg.type('lifecycle')!.examples.find((e) => e.name === name)!.source as Record<string, unknown>;
const cc = ex('change-control');
const ir = (d: unknown): GraphIR => {
  const r = compile(d, reg);
  expect(r.diagnostics.filter((x) => x.severity === 'error')).toEqual([]);
  return r.ir!;
};
const edge = (g: GraphIR, id: string) => g.edges.find((e) => e.id === id)!;
const node = (g: GraphIR, id: string) => g.nodes.find((n) => n.id === id)!;
const warnings = (d: unknown) => compile(d, reg).diagnostics.map((x) => [x.code, x.path]);

/** Two states and a one-task workflow; `step` and `extra` override. */
const mini = (step: object = {}, extra: object = {}) => ({
  version: '1',
  type: 'lifecycle',
  states: [{ id: 'a', stateType: 'initial' }, { id: 'b', stateType: 'final' }],
  workflows: [
    {
      id: 'w',
      label: 'W',
      steps: [
        { id: 's', kind: 'start', state: 'a', to: [{ step: 't' }] },
        { id: 't', label: 'Task', owner: 'Bill', state: 'a', to: [{ step: 'go' }], ...step },
        { id: 'go', kind: 'stateChange', target: 'b' },
      ],
    },
  ],
  ...extra,
});

describe('Vault lifecycle features (URS-TYP-009)', () => {
  it('turns task verdicts into labelled connections, with an eSignature icon and reasons in the tooltip', () => {
    const g = ir(cc);
    expect(edge(g, 'verdict:r_review:0')).toMatchObject({ from: 'r_review', to: 'r_approve', labels: [{ text: 'Approve', icon: 'signature' }], src: '/workflows/0/steps/2/verdicts/0' });
    expect(edge(g, 'verdict:r_review:1')).toMatchObject({ labels: [{ text: 'Reject' }], quote: 'Reasons: Incomplete; Out of scope · Comment required' });
  });

  it('badges tasks with eSignature, due time and how participants complete; lists fields under the owner', () => {
    const t = node(ir(mini({ signature: true, due: '3d', completion: 'each', fields: ['Risk', 'Impact'] })), 't');
    expect(t.badges).toEqual([{ icon: 'signature' }, { icon: 'clock', text: '3d' }, { icon: 'each' }]);
    expect(t.sub).toBe('Bill\nComplete: Risk, Impact');
    const svg = render(mini({ due: '3d' }), reg).svg!;
    expect(svg).toMatch(/<g id="n-t"[^]*?<rect[^>]*rx="7"[^>]*\/><path d="[^"]+"[^>]*\/><text[^>]*>3d<\/text>/);
  });

  it('draws parallel splits and joins as bars across the flow, in both directions', () => {
    for (const direction of ['LR', 'TB']) {
      const g = render({ ...cc, direction }, reg).geometry!;
      const bar = g.nodes.find((n) => n.id === 'c_split')!;
      expect(direction === 'LR' ? bar.h > bar.w : bar.w > bar.h, direction).toBe(true);
    }
  });

  it('draws a shared action once, from a pill naming its source states', () => {
    const g = ir(cc);
    expect(node(g, 'shared:0:from')).toMatchObject({ label: 'Any active state except Closed', phase: 'cancelled', lane: 'lifecycle:actions', style: { dash: 'dashed' } });
    expect(edge(g, 'shared:0')).toMatchObject({ from: 'shared:0:from', to: 'state:cancelled', labels: [{ text: 'Cancel' }] });
    const listed = ir({ ...cc, sharedActions: [{ state: 'cancelled', label: 'Withdraw', from: ['draft', 'in_review'] }] });
    expect(node(listed, 'shared:0:from').label).toBe('Draft, In Review');
  });

  it('marks scheduled jobs with a timer and their timing', () => {
    const g = ir(ex('states-as-rows'));
    expect(edge(g, 'action:effective:0').labels).toEqual([{ text: 'Retire after 2 years', icon: 'timer' }]);
  });

  it('draws what starts each workflow as a dashed arrow from its state', () => {
    const g = ir(cc);
    expect(edge(g, 'start:review')).toMatchObject({ from: 'state:draft', to: 'r_start', labels: [{ text: 'Submit for review' }], style: { dash: 'dashed' } });
    expect(edge(g, 'start:closure').labels).toEqual([{ text: 'On entry' }]);
  });

  it('draws the main path bold and fades the rest, only when something is marked main', () => {
    const g = ir(cc);
    expect(edge(g, 'verdict:r_review:0').style).toMatchObject({ lineWidth: 2.5 });
    expect(edge(g, 'verdict:r_review:1').style).toMatchObject({ opacity: 0.45 });
    expect(ir(mini()).edges.every((e) => !e.style)).toBe(true);
  });

  it('collapses workflows into dashed state-to-state arrows in the summary view', () => {
    const g = ir(ex('summary'));
    expect(g.partitions!.lanes.map((l) => l.id)).toEqual(['lifecycle:actions']);
    expect(g.nodes.every((n) => n.lane === 'lifecycle:actions')).toBe(true);
    expect(edge(g, 'flow:review:in_review:draft')).toMatchObject({ from: 'state:in_review', to: 'state:draft', labels: [{ text: 'Review & Approval' }], style: { dash: 'dashed' } });
    expect(g.legend!.map((l) => l.label)).toContain('Workflow transition');
  });

  it('tints initial, final and cancelled states, under section, type and own styles', () => {
    const fill = (d: object, id: string) => ir(d).partitions!.phases!.find((p) => p.id === id)!.style?.fill;
    expect([fill(cc, 'draft'), fill(cc, 'in_review'), fill(cc, 'closed'), fill(cc, 'cancelled')]).toEqual(['#dbeafe', undefined, '#dcfce7', '#fee2e2']);
    expect(fill({ ...cc, theme: 'dark' }, 'closed')).toBe('#14532d');
    expect(fill({ ...cc, styleBy: { stateType: { final: { fill: '#000000' } } } }, 'closed')).toBe('#000000');
    expect(node(ir(cc), 'state:closed').style?.fill).toBe('#dcfce7');
  });

  it('shows security under the state header and a title block under the title', () => {
    const g = ir(cc);
    expect(g.partitions!.phases![0]!.detail).toBe('Security: Owner Edit · Viewer Read');
    expect(g.meta).toEqual([
      ['Object', 'change_control__c'],
      ['Lifecycle', 'Change Control'],
      ['Version', '3'],
    ]);
    expect(render(cc, reg).svg).toMatch(/class="jtd-meta">Object: change_control__c · Lifecycle: Change Control · Version: 3</);
  });

  it('checks the lifecycle: unreachable states, dead ends, workflows that never change state, decisions and verdicts', () => {
    const d = {
      version: '1',
      type: 'lifecycle',
      states: [{ id: 'a', stateType: 'initial' }, { id: 'b' }, { id: 'c', stateType: 'final' }],
      workflows: [
        {
          id: 'w',
          label: 'W',
          steps: [
            { id: 's', kind: 'start', state: 'a', to: [{ step: 'd' }] },
            { id: 'd', kind: 'decision', state: 'a', to: [{ step: 'n' }] },
            { id: 'n', kind: 'notification', state: 'a', verdicts: [{ name: 'x', step: 's' }] },
          ],
        },
      ],
    };
    expect(warnings(d)).toEqual([
      ['lifecycle.noStateChange', '/workflows/0'],
      ['lifecycle.decision', '/workflows/0/steps/1'],
      ['lifecycle.verdicts', '/workflows/0/steps/2/verdicts'],
      ['lifecycle.deadEnd', '/states/0'],
      ['lifecycle.unreachable', '/states/1'],
      ['lifecycle.deadEnd', '/states/1'],
      ['lifecycle.unreachable', '/states/2'],
    ]);
    for (const e of reg.type('lifecycle')!.examples) expect(warnings(e.source), e.name).toEqual([]);
  });

  it('reports unknown states in shared actions and workflow starts', () => {
    expect(warnings(mini({}, { sharedActions: [{ state: 'zz', from: ['yy'] }] }))).toEqual([
      ['ref.state', '/sharedActions/0/state'],
      ['ref.state', '/sharedActions/0/from/0'],
    ]);
    const d = mini();
    (d.workflows[0] as Record<string, unknown>).start = { state: 'zz' };
    expect(warnings(d)).toEqual([['ref.state', '/workflows/0/start/state']]);
  });
});

describe('role lanes (URS-TYP-010)', () => {
  it('splits each workflow into a group of role bands: listed roles, then owners as they appear, then System', () => {
    const d = { ...cc, roleLanes: true, workflows: (cc.workflows as Record<string, unknown>[]).map((w, i) => (i === 0 ? { ...w, roles: ['Change Owner'] } : w)) };
    const g = ir(d);
    expect(g.partitions!.laneGroups!.map((x) => [x.id, x.members])).toEqual([
      ['review', ['review::Change Owner', 'review::QA Reviewer', 'review::System']],
      ['closure', ['closure::Change Owner', 'closure::Document Control', 'closure::System']],
    ]);
    expect(node(g, 'r_review').lane).toBe('review::QA Reviewer');
    expect(node(g, 'r_start').lane).toBe('review::System');
    // Role headers take the owner's colour.
    expect(g.partitions!.lanes.find((l) => l.id === 'review::QA Reviewer')!.style).toEqual({ fill: '#e0f2f1' });
  });

  it('keeps every step inside its role band, with states as rows too', () => {
    for (const statesAs of ['columns', 'rows']) {
      const d = { ...ex('roles'), statesAs };
      const g = render(d, reg).geometry!;
      const r = ir(d);
      for (const n of r.nodes) {
        const placed = g.nodes.find((x) => x.id === n.id)!;
        const band = g.bands.find((b) => (b.kind === 'lane' && b.id === n.lane) || (b.kind === 'phase' && b.id === n.phase && n.phase?.includes('::')))!;
        expect(placed.x >= band.x - 0.5 && placed.y >= band.y - 0.5 && placed.x + placed.w <= band.x + band.w + 0.5 && placed.y + placed.h <= band.y + band.h + 0.5, `${statesAs} ${n.id}`).toBe(true);
      }
    }
  });
});

describe('legend (URS-DM-026)', () => {
  it('lists the shapes, colours, markers and lines the chart uses, and nothing else', () => {
    expect(ir(cc).legend!.map((l) => l.label)).toEqual([
      'Start / end',
      'State change',
      'Task',
      'Notification',
      'Parallel split / join',
      'System action',
      'QA Reviewer',
      'Change Owner',
      'Initial state',
      'Final state',
      'Cancelled state',
      'Action available in several states',
      'eSignature required',
      'Time allowed',
      'All participants complete',
      'Main path',
      'Starts a workflow',
    ]);
    expect(ir({ ...cc, legend: false }).legend).toBeUndefined();
  });

  it('sits under the diagram, inside the drawing, in rows no wider than the diagram', () => {
    const g = render(cc, reg).geometry!;
    const l = g.legend!;
    expect(l.y).toBeGreaterThan(Math.max(...g.bands.map((b) => b.y + b.h)));
    expect(l.y + l.h).toBeCloseTo(g.height);
    expect(l.w).toBeLessThanOrEqual(g.width);
    for (const it of l.items) expect(it.text.x + it.text.w).toBeLessThanOrEqual(l.x + l.w);
    expect(render(cc, reg).svg).toContain('<g class="jtd-legend">');
  });
});
