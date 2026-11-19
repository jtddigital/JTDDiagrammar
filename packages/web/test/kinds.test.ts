import { createRegistry } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { kindOf } from '../src/workspace/kinds.ts';

const reg = createRegistry();

describe('file kinds (URS-WS-010)', () => {
  it('reads the kind from the name, and diagrams from their content', () => {
    expect(kindOf('notes.md', '', reg)).toEqual({ kind: 'markdown' });
    expect(kindOf('A.MARKDOWN', '', reg)).toEqual({ kind: 'markdown' });
    expect(kindOf('data.csv', '', reg)).toEqual({ kind: 'csv' });
    expect(kindOf('data.tsv', '', reg)).toEqual({ kind: 'csv' });
    expect(kindOf('readme', '', reg)).toEqual({ kind: 'text' });
    expect(kindOf('log.txt', '', reg)).toEqual({ kind: 'text' });
    expect(kindOf('flow.json', '{"version":"1","type":"flowchart","nodes":[]}', reg)).toEqual({ kind: 'diagram', format: 'json' });
    expect(kindOf('door.yaml', 'version: "1"\ntype: state\nstates: []\n', reg)).toEqual({ kind: 'diagram', format: 'yaml' });
    // JSON that is not a diagram, or names no registered type, is text.
    expect(kindOf('package.json', '{"name":"x"}', reg)).toEqual({ kind: 'text' });
    expect(kindOf('x.json', '{"type":"kanban"}', reg)).toEqual({ kind: 'text' });
    expect(kindOf('broken.json', '{', reg)).toEqual({ kind: 'text' });
    expect(kindOf('half.json', '{ "type": "flowchart", "nodes": [', reg)).toEqual({ kind: 'diagram', format: 'json' });
  });
});
