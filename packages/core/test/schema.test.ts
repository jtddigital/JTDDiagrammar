import { describe, expect, it } from 'vitest';
import { compile, createRegistry } from '../src/index.ts';

const reg = createRegistry();

describe('schema validation (URS-IN-001, URS-IN-004, URS-DM-004)', () => {
  it('reports every error with a JSON Pointer', () => {
    const doc = {
      version: '1',
      type: 'flowchart',
      colour: 'red',
      nodes: [{ id: 'a', shape: 'hexagon' }, { label: 'no id' }],
    };
    expect(compile(doc, reg).diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['schema.additionalProperties', '/colour'],
      ['schema.enum', '/nodes/0/shape'],
      ['schema.required', '/nodes/1'],
    ]);
  });

  it('lists allowed values for a disallowed shape', () => {
    const doc = { version: '1', type: 'flowchart', nodes: [{ id: 'a', shape: 'hexagon' }] };
    expect(compile(doc, reg).diagnostics[0]?.message).toMatch(/process, decision, terminator/);
  });

  it('skips semantic rules until the schema passes', () => {
    const doc = { version: '1', type: 'flowchart', nodes: [{ id: 1 }], edges: [{ from: 'x', to: 'y' }] };
    expect(compile(doc, reg).diagnostics.map((d) => d.code)).toEqual(['schema.type']);
  });
});
