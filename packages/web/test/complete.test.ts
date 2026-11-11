import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { schemaCompletion } from '../src/editor/complete.ts';
import { registry } from '../src/registry.ts';

/** Completion labels at the `|` marker. */
function labels(doc: string): string[] {
  const pos = doc.indexOf('|');
  const state = EditorState.create({ doc: doc.replace('|', '') });
  const r = schemaCompletion(registry)(new CompletionContext(state, pos, true));
  return r?.options.map((o) => o.label) ?? [];
}

describe('schema completion (URS-WEB-005, URS-WEB-010)', () => {
  it('offers the properties of the document type at a key position', () => {
    expect(labels('{ "type": "flowchart", "nodes": [{ "id": "a", "|" }] }')).toEqual(expect.arrayContaining(['"shape"', '"label"', '"lane"', '"style"']));
    expect(labels('{ "type": "state", "states": [{ "|" }] }')).toEqual(expect.arrayContaining(['"kind"', '"states"']));
    expect(labels('{ "type": "orgchart", "|" }')).toEqual(expect.arrayContaining(['"people"', '"theme"']));
  });

  it('offers enum values at a value position', () => {
    expect(labels('{ "type": "flowchart", "nodes": [{ "id": "a", "shape": "|" }] }')).toEqual(expect.arrayContaining(['"decision"', '"process"']));
    expect(labels('{ "type": "state", "direction": |}')).toEqual(['"LR"', '"TB"']);
    expect(labels('{ "type": "state", "states": [{ "id": "s", "kind": "|" }] }')).toEqual(['"state"', '"initial"', '"final"', '"choice"']);
  });

  it('offers nothing where the schema has no suggestions', () => {
    expect(labels('{ "type": "flowchart", "title": "|" }')).toEqual([]);
  });
});
