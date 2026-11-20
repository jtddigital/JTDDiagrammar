import { describe, expect, it } from 'vitest';
import { fields, schemaAt, type Schema } from '../src/edit/schema.ts';
import { apply, freshId, setAt, valueAt } from '../src/edit/source.ts';
import { registry } from '../src/registry.ts';

const schema = (type: string) => registry.type(type)!.schema as Schema;
const kinds = (s: Schema | undefined, root: Schema) => Object.fromEntries(fields(root, s!).map((f) => [f.name, f.kind]));

describe('schema at a place in the source (URS-WEB-025)', () => {
  it('finds the schema of a node, a connection and a lane, with a field of the right kind for each property', () => {
    const root = schema('flowchart');
    const node = kinds(schemaAt(root, '/nodes/3'), root);
    expect(node).toMatchObject({ id: 'text', shape: 'choice', label: 'text', lane: 'text', order: 'number', style: 'group', to: 'items' });
    const style = fields(root, fields(root, schemaAt(root, '/nodes/0')!).find((f) => f.name === 'style')!.schema);
    expect(Object.fromEntries(style.map((f) => [f.name, f.kind]))).toMatchObject({ fill: 'color', dash: 'choice', bold: 'yesno', lineWidth: 'number' });
    expect(kinds(schemaAt(root, '/nodes/0/to/1'), root)).toMatchObject({ node: 'text', label: 'text', exitSide: 'choice' });
    expect(kinds(schemaAt(root, '/lanes/0'), root)).toMatchObject({ id: 'text', label: 'text' });
  });

  it('follows $ref through nested states and Gantt items, and reaches single values', () => {
    const state = schema('state');
    expect(kinds(schemaAt(state, '/states/1/states/0/to/2'), state)).toMatchObject({ state: 'text', event: 'text' });
    const gantt = schema('gantt');
    expect(kinds(schemaAt(gantt, '/tasks/0/tasks/1'), gantt)).toMatchObject({ name: 'text', type: 'choice', after: 'list', duration: 'number', tasks: 'items' });
    expect(schemaAt(schema('orgchart'), '/people/2/manager')?.type).toBe('string');
    expect(schemaAt(state, '/nowhere/0')).toBeUndefined();
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
