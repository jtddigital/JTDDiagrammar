import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';
import { checkModel } from '../src/diagrams/process/checks.ts';
import { profiles, SAP, VEEVA } from '../src/diagrams/process/profiles.ts';
import { lifecycleToProcess } from '../src/diagrams/lifecycle/to-process.ts';
import { sapToProcess } from '../src/diagrams/sap/to-process.ts';
import type { Lifecycle } from '../src/diagrams/lifecycle/model.ts';
import type { Sap } from '../src/diagrams/sap/model.ts';

const reg = createRegistry();
const example = <T,>(type: string, name: string) => structuredClone(reg.type(type)!.examples.find((e) => e.name === name)!.source) as T;
const codes = (doc: unknown) => compile(doc, reg).diagnostics.map((d) => [d.code, d.path]);

describe('signals, subscriptions and channels drawn (URS-TYP-029, URS-PM-014)', () => {
  it('lifecycle: a Signals row next to the actions band, a dotted arrow from the state, dashed arrows to subscribers', () => {
    const { ir } = compile(example('lifecycle', 'events'), reg);
    expect(ir!.partitions!.lanes.map((l) => l.id).slice(0, 3)).toEqual(['lifecycle:actions', 'events:signals', 'events:subscribers']);
    const signal = ir!.nodes.find((n) => n.id === 'signal:published')!;
    expect([signal.shape, signal.label, signal.phase, signal.lane]).toEqual(['signal', 'Document published', 'effective', 'events:signals']);
    const edges = ir!.edges.filter((e) => e.id.startsWith('signal:published'));
    expect(edges.map((e) => [e.from, e.to, e.style?.dash, e.labels?.[0]?.text])).toEqual([
      ['state:effective', 'signal:published', 'dotted', undefined],
      ['signal:published', 'p_start', 'dashed', undefined],
      ['signal:published', 'sub:system:Document portal', 'dashed', 'Vault API'],
    ]);
    // One node per subscriber, however many signals reach it.
    expect(ir!.nodes.filter((n) => n.id.startsWith('sub:')).map((n) => [n.label, n.sub, n.shape])).toEqual([['Document portal', 'System', 'subprocess']]);
    expect(ir!.legend!.map((l) => l.label)).toEqual(expect.arrayContaining(['Signal', 'Subscriber', 'Publishes a signal', 'Delivers a signal']));
  });

  it('sap: signals in the column of the status that publishes them; handlers and systems subscribe', () => {
    const { ir } = compile(example('sap', 'events'), reg);
    expect(ir!.nodes.filter((n) => n.lane === 'events:signals').map((n) => n.id)).toEqual(['signal:released', 'signal:completed']);
    expect(ir!.edges.find((e) => e.id === 'signal:released:on')!.from).toBe('sys:REL');
    expect(ir!.nodes.filter((n) => n.lane === 'events:subscribers').map((n) => n.sub)).toEqual(['System', 'Handler', 'System']);
    // Signal deliveries are not workflow starts in the legend.
    const sap = example<Sap>('sap', 'events');
    const quiet = { ...sap, workflows: [] };
    expect(compile(quiet, reg).ir!.legend!.map((l) => l.label)).not.toContain('Starts a workflow or strategy, rework');
  });

  it('starts an SAP workflow or release strategy at its start node', () => {
    const flow = example<Sap>('sap', 'document-flow');
    const ir = compile({ ...flow, signals: [{ id: 'go', on: 'REL', to: [{ workflow: 'z1', channel: 'local' }] }] }, reg).ir!;
    expect(ir.edges.find((e) => e.id === 'signal:go>rs:z1:start')!.labels).toEqual([{ text: 'local' }]);
  });

  it('a signal shape leaves room for its mark', () => {
    const svg = render(example('lifecycle', 'events'), reg).svg!;
    expect(svg).toContain('Document published');
  });
});

describe('rules referenced by id (URS-PM-010, URS-TYP-029)', () => {
  it('shows a rule’s text and how it is evaluated where it is referenced', () => {
    const lc = compile(example('lifecycle', 'events'), reg).ir!;
    expect(lc.nodes.find((n) => n.id === 'state:effective:gate')!.sub).toBe('Readers assigned to training (script)');
    expect(lc.nodes.find((n) => n.id === 'a_sign')!.sub).toBe('QA\nIf: Classification = GxP (entry criteria)');
    const sap = compile(example('sap', 'events'), reg).ir!;
    expect(sap.nodes.find((n) => n.id === 'wf:approval:step:plant')!.sub).toBe('Plant manager\nIf: Estimated costs > 50,000 EUR (BRF+)');
  });

  it('goes into the annotation with annotate', () => {
    const lc = example<Lifecycle>('lifecycle', 'events');
    const ir = compile({ ...lc, annotate: { gates: true, task: true } }, reg).ir!;
    expect(ir.nodes.find((n) => n.id === 'a_sign')!.note).toBe('If: Classification = GxP (entry criteria)');
  });
});

describe('checks (URS-TYP-029)', () => {
  it('reports unknown states, workflows and rules, duplicate ids and ambiguous subscribers, in the source terms', () => {
    const lc = example<Lifecycle>('lifecycle', 'events');
    lc.rules!.push({ id: 'gxp', text: 'again' });
    lc.signals!.push({ id: 'published', on: 'nowhere', to: [{ workflow: 'ghost' }, { system: 'A', handler: 'B' }] });
    lc.states[1]!.gate = { rules: ['missing'] };
    expect(codes(lc)).toEqual([
      ['events.rule', '/rules/2/id'],
      ['events.signal', '/signals/2/id'],
      ['ref.state', '/signals/2/on'],
      ['ref.workflow', '/signals/2/to/0/workflow'],
      ['events.subscriber', '/signals/2/to/1'],
      ['ref.rule', '/states/1/gate/rules/0'],
    ]);
    const sap = example<Sap>('sap', 'events');
    sap.workflows![0]!.rules = ['nope'];
    sap.signals![0]!.on = 'XXXX';
    expect(codes(sap)).toEqual([
      ['ref.state', '/signals/0/on'],
      ['ref.rule', '/workflows/0/rules/0'],
    ]);
  });

  it('schema: a rule needs its text, a signal its state', () => {
    const lc = example<Lifecycle>('lifecycle', 'events');
    expect(codes({ ...lc, rules: [{ id: 'r' }] })[0]![0]).toBe('schema.required');
    expect(codes({ ...lc, signals: [{ id: 's' }] })[0]![0]).toBe('schema.required');
  });
});

describe('the process model (URS-PM-014, URS-PM-016)', () => {
  it('publishes each signal on entry into its state and subscribes each consumer, with nothing to report', () => {
    const lc = lifecycleToProcess(example('lifecycle', 'events'));
    const effective = lc.machines[0]!.regions[0]!.states.find((s) => s.id === 'effective')!;
    expect(effective.entry).toContainEqual({ kind: 'signal', signal: 'published' });
    expect(lc.subscriptions.filter((s) => s.signal === 'published').map((s) => [s.consumer, s.channel])).toEqual([
      [{ kind: 'workflow', workflow: 'review' }, undefined],
      [{ kind: 'system', name: 'Document portal' }, 'Vault API'],
    ]);
    expect(lc.rules.find((r) => r.id === 'trained')).toMatchObject({ text: 'Readers assigned to training', via: 'script' });
    expect(lc.rules.find((r) => r.id === 'entry:effective')!.text).toBe('Readers assigned to training (script)');
    expect(checkModel(lc, VEEVA, profiles())).toEqual([]);

    const sap = sapToProcess(example('sap', 'events'));
    const rel = sap.machines[0]!.regions.find((r) => r.id === 'system')!.states.find((s) => s.id === 'REL')!;
    expect(rel.entry).toContainEqual({ kind: 'signal', signal: 'released' });
    expect(sap.subscriptions.filter((s) => s.signal === 'released').map((s) => s.consumer.kind)).toEqual(['system', 'handler']);
    expect(checkModel(sap, SAP, profiles())).toEqual([]);
  });

  it('a flag publishes when it is set', () => {
    const sap = example<Sap>('sap', 'events');
    const p = sapToProcess({ ...sap, signals: [{ id: 'held', on: 'HOLD', to: [{ system: 'MES' }] }] });
    const on = p.machines[0]!.regions.find((r) => r.id === 'flag:HOLD')!.states.find((s) => s.id === 'HOLD:on')!;
    expect(on.entry).toContainEqual({ kind: 'signal', signal: 'held' });
  });
});
