import { describe, expect, it } from 'vitest';
import { compile, createRegistry } from '../src/index.ts';
import { checkModel, tokenFlow } from '../src/diagrams/process/checks.ts';
import { emptyModel, METACLASSES, RELATION_KINDS, type ProcessModel, type Workflow } from '../src/diagrams/process/model.ts';
import { coreCombine, PROCESS, profiles, Profiles, SAP, SERVICENOW, VEEVA } from '../src/diagrams/process/profiles.ts';
import { call, deliver, initialInstance, permission, trigger } from '../src/diagrams/process/semantics.ts';
import { lifecycleToProcess } from '../src/diagrams/lifecycle/to-process.ts';
import { sapToProcess, setStatus } from '../src/diagrams/sap/to-process.ts';
import type { Lifecycle } from '../src/diagrams/lifecycle/model.ts';
import type { Sap } from '../src/diagrams/sap/model.ts';

const reg = createRegistry();
const example = <T,>(type: string, name: string) => reg.type(type)!.examples.find((e) => e.name === name)!.source as T;
const reg_ = profiles();

describe('canonical metamodel (URS-PM-001, PM-002, PM-004)', () => {
  it('implements exactly the allowlisted UML metaclasses (ARCHITECTURE §13.3)', () => {
    // Adding a metaclass needs a URS change.
    expect([...METACLASSES].sort()).toEqual(
      [
        'Activity',
        'ActivityFinalNode',
        'ActivityPartition',
        'Association',
        'CallEvent',
        'CallOperationAction',
        'ChangeEvent',
        'Class',
        'Constraint',
        'ControlFlow',
        'DecisionNode',
        'Dependency',
        'ForkNode',
        'InitialNode',
        'JoinNode',
        'MergeNode',
        'OpaqueAction',
        'Operation',
        'Profile',
        'Property',
        'Pseudostate',
        'Region',
        'SendSignalAction',
        'Signal',
        'SignalEvent',
        'State',
        'StateMachine',
        'Stereotype',
        'TimeEvent',
        'Transition',
        'Trigger',
      ].sort(),
    );
    for (const out of ['Interaction', 'Lifeline', 'UseCase', 'Component', 'Port', 'Node', 'Deployment', 'Collaboration']) expect(METACLASSES as readonly string[]).not.toContain(out);
  });

  it('has a closed set of object relations', () => {
    expect(RELATION_KINDS).toEqual(['association', 'composition', 'derive', 'create']);
  });
});

describe('profiles (URS-PM-015)', () => {
  it('extend Process only, once, without redefining core outcomes or repeating stereotypes', () => {
    expect(() => new Profiles().register({ ...SAP, extends: 'veeva' as 'process' })).toThrow(/must extend 'process'/);
    expect(() => new Profiles().register({ ...SAP, extends: undefined })).toThrow(/must extend 'process'/);
    expect(() => new Profiles().register(SAP).register(SAP)).toThrow(/already registered/);
    expect(() => new Profiles().register({ ...VEEVA, id: 'x', outcomes: ['forbidden'] })).toThrow(/core outcome/);
    expect(() => new Profiles().register({ ...VEEVA, id: 'y', stereotypes: [...VEEVA.stereotypes, VEEVA.stereotypes[0]!] })).toThrow(/twice/);
    expect(reg_.get('process')).toBe(PROCESS);
    expect([SAP, VEEVA, SERVICENOW].every((p) => reg_.get(p.id) === p)).toBe(true);
  });

  it('report stereotypes from another profile, unknown ones, and ones on the wrong element', () => {
    const m = emptyModel('veeva');
    m.objects.push({ id: 'o', name: 'Order', stereotype: { profile: 'sap', name: 'SAP Object' } }, { id: 'p', name: 'Doc', stereotype: { profile: 'veeva', name: 'Veeva Nope' } });
    m.operations.push({ id: 'x', name: 'approve', object: 'p', stereotype: { profile: 'veeva', name: 'Veeva State' } });
    expect(checkModel(m, VEEVA, reg_).map((f) => [f.code, f.message])).toEqual([
      ['profile', "'Order' uses «SAP Object» from profile 'sap', which conflicts with the chart's profile 'veeva'"],
      ['profile', "'Doc' uses «Veeva Nope», which profile 'veeva' does not define"],
      ['profile', "«Veeva State» does not apply to a Operation ('approve')"],
    ]);
  });
});

describe('permission (URS-PM-009)', () => {
  const m = emptyModel('sap');
  m.permissions.push(
    { state: 'A', operation: 'go', outcome: 'allowed' },
    { state: 'B', operation: 'go', outcome: 'forbidden' },
    { state: 'C', operation: 'go', outcome: 'warning' },
    { state: 'A', operation: 'edit', role: 'Owner', outcome: 'allowed' },
  );
  it('combines the active states: forbidden wins, then allowed; no entry falls back to the profile', () => {
    expect(coreCombine(['allowed', 'forbidden'])).toBe('forbidden');
    expect(coreCombine(['allowed'])).toBe('allowed');
    expect(permission(m, PROCESS, ['A', 'B'], 'go')).toBe('forbidden');
    expect(permission(m, PROCESS, ['A'], 'go')).toBe('allowed');
    expect(permission(m, PROCESS, ['Z'], 'go')).toBe('allowed');
  });
  it('lets profiles add outcomes and their own rule (SAP: warning)', () => {
    expect(permission(m, SAP, ['A', 'C'], 'go')).toBe('warning');
    expect(permission(m, SAP, ['B', 'C'], 'go')).toBe('forbidden');
  });
  it('takes the role into account (Veeva atomic security)', () => {
    expect(permission({ ...m, permissions: [{ state: 'A', operation: 'edit', role: 'Owner', outcome: 'forbidden' }] }, PROCESS, ['A'], 'edit', 'Owner')).toBe('forbidden');
    expect(permission({ ...m, permissions: [{ state: 'A', operation: 'edit', role: 'Owner', outcome: 'forbidden' }] }, PROCESS, ['A'], 'edit', 'Viewer')).toBe('allowed');
  });
});

describe('worked examples (URS-PM-007, PM-008, PM-013; ARCHITECTURE §13.5)', () => {
  it('1. SAP Release sets REL and INWK in one call, and is refused in INIT or with HOLD set', () => {
    const order = example<Sap>('sap', 'document-flow');
    const m = sapToProcess(order);
    const machine = m.machines[0]!;
    const inst = initialInstance(machine);
    expect(Object.fromEntries(inst)).toEqual({ system: 'CRTD', user: 'INIT', 'flag:HOLD': 'HOLD:off' });
    expect(call(m, SAP, machine, inst, 'release')).toMatchObject({ outcome: 'forbidden', fired: [] });
    expect(inst.get('system')).toBe('CRTD');
    call(m, SAP, machine, inst, setStatus('APPR'));
    call(m, SAP, machine, inst, setStatus('HOLD'));
    expect(call(m, SAP, machine, inst, 'release').outcome).toBe('forbidden');
    call(m, SAP, machine, inst, 'delete:HOLD');
    const step = call(m, SAP, machine, inst, 'release');
    expect(step.outcome).toBe('allowed');
    expect(step.fired.map((t) => t.region).sort()).toEqual(['system', 'user']);
    expect([inst.get('system'), inst.get('user')]).toEqual(['REL', 'INWK']);
    // Entering REL publishes it and creates the purchase requisition, whose creation starts its release strategy.
    expect(step.signals).toEqual(expect.arrayContaining(['REL set', 'INWK set', 'pr created']));
    expect(step.calls.map((c) => c.operation)).toContain('create:pr');
    expect(deliver(m, 'pr created').map((s) => s.consumer)).toEqual([{ kind: 'workflow', workflow: 'z1' }]);
    // A warning still lets it run.
    expect(call(m, SAP, machine, inst, 'teco').outcome).toBe('warning');
  });

  it('2. purchase requisition approval: one subscription in, one operation call out (corrected order)', () => {
    const m: ProcessModel = {
      ...emptyModel('sap'),
      objects: [{ id: 'pr', name: 'Purchase requisition' }],
      operations: [{ id: 'save', name: 'save', object: 'pr', callers: ['user'] }, { id: 'release', name: 'release', object: 'pr' }],
      signals: [{ id: 'PR created', name: 'PR created' }, { id: 'PR approved', name: 'PR approved' }],
      machines: [
        {
          object: 'pr',
          regions: [{ id: 'release', name: 'Release status', initial: 'new', states: [{ id: 'new', name: 'New' }, { id: 'open', name: 'Not released', entry: [{ kind: 'signal', signal: 'PR created' }] }, { id: 'rel', name: 'Released', entry: [{ kind: 'signal', signal: 'PR approved' }] }] }],
          transitions: [
            { id: 't1', name: 'save', region: 'release', from: 'new', to: 'open', trigger: { kind: 'call', operation: 'save' } },
            { id: 't2', name: 'release', region: 'release', from: 'open', to: 'rel', trigger: { kind: 'call', operation: 'release' } },
          ],
        },
      ],
      subscriptions: [{ id: 's', name: 'approval on creation', signal: 'PR created', consumer: { kind: 'workflow', workflow: 'wf' }, channel: 'local' }],
      workflows: [
        {
          id: 'wf',
          name: 'PR approval',
          nodes: [
            { id: 'i', kind: 'initial', name: 'start' },
            { id: 'a', kind: 'task', name: 'Approve', role: 'Manager' },
            { id: 'r', kind: 'task', name: 'Release', calls: [{ operation: 'release', object: 'pr' }] },
            { id: 'f', kind: 'final', name: 'end' },
          ],
          flows: [
            { id: 'f1', name: '', from: 'i', to: 'a' },
            { id: 'f2', name: 'Approve', from: 'a', to: 'r', guard: 'approved' },
            { id: 'f3', name: '', from: 'r', to: 'f' },
          ],
        },
      ],
    };
    const machine = m.machines[0]!;
    const inst = initialInstance(machine);
    const saved = call(m, SAP, machine, inst, 'save');
    expect(saved.signals).toEqual(['PR created']);
    const started = deliver(m, 'PR created');
    expect(started.map((s) => s.consumer)).toEqual([{ kind: 'workflow', workflow: 'wf' }]);
    const calls = m.workflows[0]!.nodes.flatMap((n) => n.calls ?? []);
    expect(calls).toEqual([{ operation: 'release', object: 'pr' }]);
    expect(call(m, SAP, machine, inst, calls[0]!.operation).signals).toEqual(['PR approved']);
    expect(inst.get('release')).toBe('rel');
    expect(checkModel(m, SAP, reg_)).toEqual([]);
  });

  it('3. Veeva verdict: the state change calls the lifecycle operation; entry creates the child record', () => {
    const lc = example<Lifecycle>('lifecycle', 'change-control');
    const m = lifecycleToProcess(lc);
    const machine = m.machines[0]!;
    const inst = initialInstance(machine);
    call(m, VEEVA, machine, inst, 'change:in_review');
    const step = call(m, VEEVA, machine, inst, 'change:approved');
    expect(inst.get('lifecycle')).toBe('approved');
    expect(step.signals).toEqual(['entered:approved']);
    expect(step.calls).toEqual([{ kind: 'call', operation: 'create:approved:0', object: 'record:approved:0' }]);
    expect(m.relations).toEqual([expect.objectContaining({ kind: 'create', from: 'object', to: 'record:approved:0' })]);
    // The review workflow's state change task calls it.
    expect(m.workflows.find((w) => w.id === 'review')!.nodes.find((n) => n.id === 'r_approve')!.calls).toEqual([{ operation: 'change:approved' }]);
  });

  it('4. Veeva scheduled expiry: a time trigger moves the record without a permission check', () => {
    const lc: Lifecycle = {
      version: '1',
      type: 'lifecycle',
      states: [{ id: 'eff', stateType: 'initial', security: { Owner: 'Read' }, to: [{ state: 'exp', by: 'job', after: '2 years' }] }, { id: 'exp', stateType: 'final' }],
    };
    const m = lifecycleToProcess(lc);
    m.permissions.push({ state: 'eff', operation: 'anything', outcome: 'forbidden' });
    const inst = initialInstance(m.machines[0]!);
    expect(m.machines[0]!.transitions[0]!.trigger).toEqual({ kind: 'time', after: '2 years' });
    expect(trigger(m.machines[0]!, inst, { kind: 'time', after: '2 years' }).fired).toHaveLength(1);
    expect(inst.get('lifecycle')).toBe('exp');
  });

  it('5. ServiceNow Resolve: a UI action guarded by a rule', () => {
    const m: ProcessModel = {
      ...emptyModel('servicenow'),
      objects: [{ id: 'inc', name: 'Incident', stereotype: { profile: 'servicenow', name: 'ServiceNow Record' } }],
      operations: [{ id: 'resolve', name: 'Resolve', object: 'inc', callers: ['user'], stereotype: { profile: 'servicenow', name: 'ServiceNow UI Action' } }],
      rules: [{ id: 'hasNotes', name: 'resolution notes', text: 'Resolution notes are filled in', via: 'UI action condition' }],
      signals: [{ id: 'resolved', name: 'Incident resolved' }],
      subscriptions: [{ id: 'notify', name: 'caller notification', signal: 'resolved', consumer: { kind: 'system', name: 'Email' }, channel: 'local' }],
      machines: [
        {
          object: 'inc',
          regions: [{ id: 'state', name: 'State', initial: 'wip', states: [{ id: 'wip', name: 'In Progress' }, { id: 'res', name: 'Resolved', entry: [{ kind: 'signal', signal: 'resolved' }] }] }],
          transitions: [{ id: 't', name: 'Resolve', region: 'state', from: 'wip', to: 'res', trigger: { kind: 'call', operation: 'resolve' }, guard: 'hasNotes' }],
        },
      ],
    };
    const machine = m.machines[0]!;
    const inst = initialInstance(machine);
    expect(call(m, SERVICENOW, machine, inst, 'resolve', undefined, () => false).fired).toEqual([]);
    expect(call(m, SERVICENOW, machine, inst, 'resolve').signals).toEqual(['resolved']);
    expect(deliver(m, 'resolved')[0]!.consumer).toEqual({ kind: 'system', name: 'Email' });
    expect(checkModel(m, SERVICENOW, reg_)).toEqual([]);
  });
});

describe('token-flow checks (URS-PM-017)', () => {
  const wf = (nodes: [string, Workflow['nodes'][number]['kind']][], flows: [string, string][]): Workflow => ({
    id: 'w',
    name: 'W',
    nodes: nodes.map(([id, kind]) => ({ id, kind, name: id, src: `/${id}` })),
    flows: flows.map(([from, to], i) => ({ id: `f${i}`, name: '', from, to })),
  });

  it('finds a join behind an exclusive decision: it can never complete', () => {
    const w = wf(
      [['i', 'initial'], ['d', 'decision'], ['a', 'task'], ['b', 'task'], ['j', 'join'], ['f', 'final']],
      [['i', 'd'], ['d', 'a'], ['d', 'b'], ['a', 'j'], ['b', 'j'], ['j', 'f']],
    );
    const t = tokenFlow(w);
    expect(t.deadJoins.map((n) => n.id)).toEqual(['j']);
    expect(t.unreachable.map((n) => n.id)).toEqual(['j', 'f']);
    const m = { ...emptyModel('process'), workflows: [w] };
    expect(checkModel(m, PROCESS, reg_).map((f) => [f.code, f.src])).toEqual([
      ['deadJoin', '/j'],
      ['unreachable', '/f'],
    ]);
  });

  it('accepts a fork and join, and a loop with a way out', () => {
    const forked = wf(
      [['i', 'initial'], ['k', 'fork'], ['a', 'task'], ['b', 'task'], ['j', 'join'], ['f', 'final']],
      [['i', 'k'], ['k', 'a'], ['k', 'b'], ['a', 'j'], ['b', 'j'], ['j', 'f']],
    );
    const looped = wf([['i', 'initial'], ['a', 'task'], ['d', 'decision'], ['f', 'final']], [['i', 'a'], ['a', 'd'], ['d', 'a'], ['d', 'f']]);
    for (const w of [forked, looped]) expect(tokenFlow(w)).toMatchObject({ deadJoins: [], unreachable: [], completes: true });
  });

  it('finds unreachable tasks and workflows that never complete', () => {
    const w = wf([['i', 'initial'], ['a', 'task'], ['b', 'task'], ['x', 'task']], [['i', 'a'], ['a', 'b'], ['b', 'a']]);
    const t = tokenFlow(w);
    expect(t.unreachable.map((n) => n.id)).toEqual(['x']);
    expect(t.completes).toBe(false);
  });
});

describe('state machine checks (URS-PM-006, PM-014, PM-017)', () => {
  const base = (): ProcessModel => ({
    ...emptyModel('process'),
    objects: [{ id: 'o', name: 'O' }],
    operations: [{ id: 'go', name: 'go', object: 'o' }],
    signals: [{ id: 'ping', name: 'ping' }],
    machines: [
      {
        object: 'o',
        regions: [{ id: 'r', name: 'R', initial: 'a', states: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }],
        transitions: [
          { id: 't1', name: 'A → B', region: 'r', from: 'a', to: 'b', trigger: { kind: 'call', operation: 'go' }, src: '/t1' },
          { id: 't2', name: 'B → A', region: 'r', from: 'b', to: 'a', trigger: { kind: 'signal', signal: 'ping' }, src: '/t2' },
          { id: 't3', name: 'B → B', region: 'r', from: 'b', to: 'b', src: '/t3' },
        ],
      },
    ],
    permissions: [
      { state: 'a', operation: 'go', outcome: 'forbidden' },
      { state: 'b', operation: 'go', outcome: 'forbidden' },
    ],
    subscriptions: [{ id: 's', name: 'listener', signal: 'pong', consumer: { kind: 'handler', name: 'h' }, src: '/s' }],
  });

  it('reports triggers nothing raises, transitions without one, operations never permitted, and orphan subscriptions', () => {
    expect(checkModel(base(), PROCESS, reg_).map((f) => [f.code, f.message])).toEqual([
      ['silentTrigger', "'A → B' waits for 'go', which nothing calls"],
      ['silentTrigger', "'B → A' waits for 'ping', which nothing publishes"],
      ['noTrigger', "'B → B' has nothing that fires it"],
      ['neverPermitted', "'go' is forbidden in every reachable combination of states"],
      ['orphanSubscription', "'listener' listens for 'pong', which nothing publishes"],
    ]);
  });
});

describe('platform mappings (URS-PM-016) and diagnostics', () => {
  it('maps every construct of every lifecycle and sap example, with nothing to report', () => {
    for (const e of reg.type('lifecycle')!.examples) {
      const lc = e.source as Lifecycle;
      const m = lifecycleToProcess(lc);
      expect(m.machines[0]!.regions[0]!.states.map((s) => s.id), e.name).toEqual(lc.states.map((s) => s.id));
      expect(m.workflows.map((w) => w.nodes.length), e.name).toEqual((lc.workflows ?? []).map((w) => w.steps.length));
      expect(m.operations.filter((o) => o.stereotype?.name === 'Veeva User Action').length, e.name).toBe(lc.states.flatMap((s) => s.to ?? []).filter((a) => a.by !== 'job').length + (lc.sharedActions?.length ?? 0));
      expect(checkModel(m, VEEVA, reg_), e.name).toEqual([]);
    }
    for (const e of reg.type('sap')!.examples) {
      const sap = e.source as Sap;
      const m = sapToProcess(sap);
      const states = m.machines[0]!.regions.flatMap((r) => r.states);
      expect(states.filter((s) => s.stereotype?.name === 'SAP System Status').length, e.name).toBe(sap.systemStatuses?.length ?? 0);
      expect(new Set(states.filter((s) => s.stereotype?.name === 'SAP User Status').map((s) => (s.stereotype!.values as { code: string }).code)).size, e.name).toBe(sap.userStatuses?.length ?? 0);
      expect(m.workflows.length, e.name).toBe((sap.workflows?.length ?? 0) + (sap.releaseStrategies?.length ?? 0));
      expect(m.permissions.filter((p) => !p.role).length, e.name).toBe((sap.userStatuses ?? []).reduce((n, u) => n + Object.keys(u.control ?? {}).length, 0));
      expect(checkModel(m, SAP, reg_), e.name).toEqual([]);
    }
  });

  it('turns findings into diagnostics at the source, in platform terms', () => {
    const flow = example<Sap>('sap', 'document-flow');
    // F1 and Q1 run in parallel after P1; putting a release condition in front of Q1 alone would still be fine,
    // but a release that is forbidden in every status is reported.
    const forbidden = { ...flow, userStatuses: flow.userStatuses!.map((u) => ({ ...u, control: { ...u.control, close: 'forbidden' as const } })) };
    expect(compile(forbidden, reg).diagnostics.map((d) => [d.code, d.path, d.message])).toEqual([['process.neverPermitted', '/transactions/3', "'Complete (business)' is forbidden in every reachable combination of states"]]);
    const lc = example<Lifecycle>('lifecycle', 'change-control');
    const dead = {
      ...lc,
      workflows: [
        {
          id: 'w',
          label: 'W',
          start: { state: 'draft' },
          steps: [
            { id: 's', kind: 'start', state: 'draft', to: [{ step: 'd' }] },
            { id: 'd', kind: 'decision', state: 'draft', to: [{ step: 'a' }, { step: 'b' }] },
            { id: 'a', state: 'draft', to: [{ step: 'j' }] },
            { id: 'b', state: 'draft', to: [{ step: 'j' }] },
            { id: 'j', kind: 'join', state: 'draft', to: [{ step: 'c' }] },
            { id: 'c', kind: 'stateChange', target: 'in_review' },
          ],
        },
      ],
    };
    expect(compile(dead, reg).diagnostics.filter((d) => d.code.startsWith('process.')).map((d) => [d.code, d.path])).toEqual([['process.deadJoin', '/workflows/0/steps/4']]);
  });
});
