import { describe, expect, it } from 'vitest';
import { compile, createRegistry } from '../src/index.ts';
import { checkModel } from '../src/diagrams/process/checks.ts';
import { profiles } from '../src/diagrams/process/profiles.ts';
import type { ProcessDoc } from '../src/diagrams/process/type/model.ts';
import { processToModel } from '../src/diagrams/process/type/to-model.ts';

const reg = createRegistry();
const example = (name: string) => structuredClone(reg.type('process')!.examples.find((e) => e.name === name)!.source) as ProcessDoc;
const codes = (doc: unknown) => compile(doc, reg).diagnostics.map((d) => [d.code, d.path]);

describe('generic process type (URS-PM-020)', () => {
  it('draws one row per region, then signals, subscribers and workflows', () => {
    const ir = compile(example('work-order'), reg).ir!;
    expect(ir.partitions!.lanes.map((l) => l.id)).toEqual(['region:status', 'region:hold', 'events:signals', 'events:subscribers', 'wf:approval']);
    expect(ir.nodes.find((n) => n.id === 'st:WAPPR')).toMatchObject({ shape: 'state', label: 'Waiting on approval', sub: 'Forbidden: Start work', lane: 'region:status' });
    expect(ir.nodes.find((n) => n.id === 'st:COMP')!.sub).toBe('Entry: Post actual costs');
    expect(ir.nodes.filter((n) => n.shape === 'initial').map((n) => n.id)).toEqual(['init:WAPPR', 'init:free']);
    expect(ir.edges.find((e) => e.id === 'final:CLOSE>')).toMatchObject({ from: 'st:CLOSE', to: 'final:CLOSE' });
    // Triggers label the transitions; time triggers carry a timer.
    expect(ir.edges.find((e) => e.id === 'tr:t3')!.labels).toEqual([{ text: 'After 30d', icon: 'timer' }]);
    expect(ir.edges.find((e) => e.id === 'tr:t0')!.labels).toEqual([{ text: 'Approve' }]);
  });

  it('draws workflows in BPMN-style notation; rules label flows; send nodes publish signals', () => {
    const ir = compile(example('work-order'), reg).ir!;
    const shape = (id: string) => ir.nodes.find((n) => n.id === `wf:approval:${id}`)!.shape;
    expect(['start', 'size', 'manager', 'merge', 'tell', 'end'].map(shape)).toEqual(['start', 'decision', 'process', 'choice', 'signal', 'end']);
    expect(ir.nodes.find((n) => n.id === 'wf:approval:manager')!.sub).toBe('Maintenance manager\nCalls: Approve');
    expect(ir.edges.find((e) => e.from === 'wf:approval:size' && e.to === 'wf:approval:manager')!.labels).toEqual([{ text: 'Estimated cost > 25,000 (script)' }]);
    expect(ir.edges.find((e) => e.from === 'wf:approval:tell' && e.to === 'signal:approved')).toBeDefined();
    expect(ir.edges.find((e) => e.from === 'signal:created' && e.to === 'wf:approval:start')).toBeDefined();
  });

  it('shows stereotypes and keeps a guard with its trigger', () => {
    const ir = compile(example('incident'), reg).ir!;
    expect(ir.nodes.find((n) => n.id === 'st:hold')!.sub).toBe('«ServiceNow State»\nForbidden: Resolve');
    expect(ir.edges.find((e) => e.from === 'st:progress' && e.to === 'st:resolved')!.labels).toEqual([{ text: 'Resolve [Resolution notes filled in (script)]' }]);
    expect(ir.meta).toContainEqual(['Profile', 'servicenow']);
  });

  it('maps onto the canonical model with nothing to report', () => {
    for (const name of ['work-order', 'incident', 'mdg-change-request']) {
      const doc = example(name);
      const m = processToModel(doc);
      expect(m.machines[0]!.regions.map((r) => r.initial), name).toEqual(doc.regions.map((r) => r.states.find((s) => s.initial)?.id));
      expect(m.machines[0]!.transitions.length, name).toBe(doc.transitions!.length);
      expect(m.workflows.map((w) => w.nodes.length), name).toEqual(doc.workflows!.map((w) => w.nodes.length));
      // Free stereotypes are not checked; a named profile's are.
      expect(checkModel(m, profiles().get(m.profile)!, profiles()).filter((f) => doc.profile || f.code !== 'profile'), name).toEqual([]);
    }
    const m = processToModel(example('work-order'));
    expect(m.machines[0]!.transitions.find((t) => t.to === 'CLOSE')!.trigger).toEqual({ kind: 'time', after: '30d' });
    expect(m.workflows[0]!.nodes.find((n) => n.id === 'tell')).toMatchObject({ kind: 'send', signal: 'approved' });
  });

  it('reports references, regions, triggers, outcomes and profiles in its own terms', () => {
    const doc = example('work-order');
    doc.transitions!.push({ from: 'WAPPR', to: 'held', trigger: { call: 'nope', after: '1d' }, guard: 'ghost' });
    doc.permissions!.push({ state: 'APPR', operation: 'start', outcome: 'warning' });
    doc.workflows![0]!.nodes.push({ id: 'x', kind: 'send' });
    doc.workflows![0]!.flows.push({ from: 'x', to: 'y' });
    doc.regions[0]!.states.push({ id: 'free' });
    expect(codes(doc)).toEqual([
      ['process.id', '/regions/1/states/0/id'],
      ['process.region', '/transitions/7/to'],
      ['process.trigger', '/transitions/7/trigger'],
      ['ref.operation', '/transitions/7/trigger/call'],
      ['process.outcome', '/permissions/3/outcome'],
      ['process.send', '/workflows/0/nodes/7'],
      ['ref.node', '/workflows/0/flows/7/to'],
      ['ref.rule', '/transitions/7/guard'],
    ]);
    expect(codes({ ...example('incident'), profile: 'maximo' })).toContainEqual(['process.profileUnknown', '/profile']);
    expect(codes({ ...example('work-order'), regions: [] })).toContainEqual(['process.regions', '/regions']);
  });

  it('charts an SAP MDG change request in the sap profile (URS-TYP-028)', () => {
    const doc = example('mdg-change-request');
    const m = processToModel(doc);
    expect(m.profile).toBe('sap');
    expect(m.objects[0]!.stereotype).toEqual({ profile: 'sap', name: 'SAP MDG Change Request', values: { crType: 'MAT01', entity: 'MATERIAL' } });
    expect(m.machines[0]!.regions[0]!.states.map((s) => (s.stereotype!.values as { code: string }).code)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(m.rules.find((r) => r.id === 'route')).toMatchObject({ via: 'BRF+' });
    expect(m.workflows[0]!.nodes.filter((n) => n.stereotype?.name === 'SAP MDG Step').map((n) => (n.stereotype!.values as { step: string }).step)).toEqual(['00', '01', '90', '95', '91', '92']);
    // An SAP stereotype applied to the wrong kind of element is reported.
    doc.regions[0]!.states[0]!.stereotype = 'SAP MDG Step';
    expect(codes(doc)).toEqual([['process.profile', '/regions/0/states/0']]);
  });

  it('runs the model checks: a named profile checks stereotypes; free ones are not', () => {
    const doc = example('incident');
    doc.operations![0]!.stereotype = 'Business Rule';
    expect(codes(doc)).toEqual([['process.profile', '/operations/0']]);
    const free = example('work-order');
    free.transitions!.push({ from: 'APPR', to: 'WAPPR' });
    expect(codes(free)).toEqual([['process.noTrigger', '/transitions/7']]);
  });
});
