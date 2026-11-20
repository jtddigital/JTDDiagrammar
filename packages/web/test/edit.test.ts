import { describe, expect, it } from 'vitest';
import { fields, problem, schemaAt, targets, type Schema } from '../src/edit/schema.ts';
import { apply, freshId, setAt, valueAt } from '../src/edit/source.ts';
import { registry } from '../src/registry.ts';

const schema = (type: string) => registry.type(type)!.schema as Schema;
const kinds = (s: Schema | undefined, root: Schema) => Object.fromEntries(fields(root, s!).map((f) => [f.name, f.kind]));

describe('schema at a place in the source (URS-WEB-025)', () => {
  it('finds the schema of a node, a connection and a lane, with a field of the right kind for each property', () => {
    const root = schema('flowchart');
    const node = kinds(schemaAt(root, '/nodes/3'), root);
    expect(node).toMatchObject({ id: 'text', shape: 'choice', label: 'text', lane: 'ref', phase: 'ref', order: 'number', style: 'group', to: 'items' });
    const style = fields(root, fields(root, schemaAt(root, '/nodes/0')!).find((f) => f.name === 'style')!.schema);
    expect(Object.fromEntries(style.map((f) => [f.name, f.kind]))).toMatchObject({ fill: 'color', dash: 'choice', bold: 'yesno', lineWidth: 'number' });
    expect(kinds(schemaAt(root, '/nodes/0/to/1'), root)).toMatchObject({ node: 'ref', label: 'text', exitSide: 'choice' });
    expect(kinds(schemaAt(root, '/lanes/0'), root)).toMatchObject({ id: 'text', label: 'text' });
  });

  it('follows $ref through nested states and Gantt items, and reaches single values', () => {
    const state = schema('state');
    expect(kinds(schemaAt(state, '/states/1/states/0/to/2'), state)).toMatchObject({ state: 'ref', event: 'text' });
    const gantt = schema('gantt');
    expect(kinds(schemaAt(gantt, '/tasks/0/tasks/1'), gantt)).toMatchObject({ name: 'text', type: 'choice', after: 'list', duration: 'number', tasks: 'items' });
    expect(schemaAt(schema('orgchart'), '/people/2/manager')?.type).toBe('string');
    expect(schemaAt(state, '/nowhere/0')).toBeUndefined();
  });

  it('knows which fields refer to other elements, and what they may take (URS-WEB-027)', () => {
    const root = schema('flowchart');
    const lane = fields(root, schemaAt(root, '/nodes/0')!).find((f) => f.name === 'lane')!;
    expect([lane.kind, lane.ref]).toEqual(['ref', 'lanes']);
    const doc = { lanes: [{ id: 'ops', label: 'Operations' }, { id: 'fin' }], nodes: [{ id: 'a', label: 'Start' }, { id: 'b', to: [{ node: 'a' }] }] };
    expect(targets(doc, 'lanes')).toEqual([{ id: 'ops', label: 'Operations' }, { id: 'fin' }]);
    expect(targets(doc, 'nodes').map((t) => t.id)).toEqual(['a', 'b']);
    // Lists of references, and references by another key across collections (SAP statuses).
    const life = schema('lifecycle');
    expect(fields(life, schemaAt(life, '/stages/0')!).find((f) => f.name === 'states')).toMatchObject({ kind: 'refs', ref: 'states' });
    const sap = schema('sap');
    expect(fields(sap, schemaAt(sap, '/documents/0')!).find((f) => f.name === 'status')).toMatchObject({ kind: 'ref', ref: 'systemStatuses,userStatuses#code' });
    expect(targets({ systemStatuses: [{ code: 'REL', label: 'Released' }], userStatuses: [{ code: 'APPR' }] }, 'systemStatuses,userStatuses#code')).toEqual([{ id: 'REL', label: 'Released' }, { id: 'APPR' }]);
  });

  it('says why a value does not fit its schema (URS-WEB-025)', () => {
    const root = schema('flowchart');
    const node = schemaAt(root, '/nodes/0')!;
    const field = (name: string, s: Schema = node) => fields(root, s).find((f) => f.name === name)!.schema;
    const style = field('style');
    expect(problem(root, field('fill', style), '#zz0000')).toBe('Must be a hex colour, like #1d4ed8.');
    expect(problem(root, field('fill', style), '#1d4ed8')).toBeUndefined();
    expect(problem(root, field('lineWidth', style), 20)).toMatch(/^At most/);
    expect(problem(root, field('order'), 1.5)).toBe('Must be a whole number.');
    expect(problem(root, field('shape'), 'blob')).toMatch(/^Must be one of: process, decision/);
    expect(problem(root, field('lane'), 'not valid!')).toMatch(/^Not a valid id/);
    expect(problem(root, field('label'), 'Anything goes')).toBeUndefined();
    const gantt = schema('gantt');
    const after = fields(gantt, schemaAt(gantt, '/tasks/0')!).find((f) => f.name === 'after')!.schema;
    expect(problem(gantt, after, ['plan', 'x FS+2'])).toBeUndefined();
    expect(problem(gantt, after, ['plan', 'x QQ'])).toMatch(/^Item 2/);
  });

  it('marks required properties and keeps descriptions as hints', () => {
    const root = schema('flowchart');
    const id = fields(root, schemaAt(root, '/nodes/0')!).find((f) => f.name === 'id')!;
    expect(id.required).toBe(true);
    expect(fields(root, schemaAt(root, '/nodes/0')!).find((f) => f.name === 'owner')!.description).toMatch(/Who does it/);
  });
});

describe('editing the source by pointer (URS-WEB-025, WEB-026)', () => {
  const text = `{\n  "version": "1",\n  "type": "flowchart",\n  "nodes": [\n    { "id": "a", "label": "Start" },\n    { "id": "b" }\n  ]\n}\n`;

  it('sets, creates and removes properties, keeping the rest of the text', () => {
    const set = setAt(text, '/nodes/1/label', 'Finish');
    expect(JSON.parse(set).nodes[1]).toEqual({ id: 'b', label: 'Finish' });
    expect(set).toContain('{ "id": "a", "label": "Start" }');
    // Missing parents are made.
    expect(JSON.parse(setAt(text, '/nodes/0/style/fill', '#ff0000')).nodes[0].style).toEqual({ fill: '#ff0000' });
    expect(JSON.parse(setAt(text, '/nodes/0/label', undefined)).nodes[0]).toEqual({ id: 'a' });
    // An array item goes too.
    expect(JSON.parse(setAt(text, '/nodes/0', undefined)).nodes).toEqual([{ id: 'b' }]);
  });

  it('appends to an array, making it when missing, and says where the new value is', () => {
    const doc = JSON.parse(text);
    const added = apply(text, doc, { at: '/nodes', append: true, value: { id: 'c' } });
    expect(added.at).toBe('/nodes/2');
    expect(valueAt(JSON.parse(added.text), added.at)).toEqual({ id: 'c' });
    const linked = apply(text, doc, { at: '/nodes/0/to', append: true, value: { node: 'b' } });
    expect(linked.at).toBe('/nodes/0/to/0');
    expect(JSON.parse(linked.text).nodes[0].to).toEqual([{ node: 'b' }]);
    expect(JSON.parse(apply(text, doc, { at: '/nodes/1/label', value: 'X' }).text).nodes[1].label).toBe('X');
  });

  it('makes ids that are not used yet', () => {
    const doc = { nodes: [{ id: 'decision-1' }, { id: 'x', to: [{ id: 'decision-2' }] }] };
    expect(freshId(doc, 'Decision')).toBe('decision-3');
    expect(freshId(doc, 'Start / end')).toBe('start-end-1');
    expect(freshId(doc, '')).toBe('item-1');
  });
});
