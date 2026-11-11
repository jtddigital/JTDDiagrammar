import { describe, expect, it } from 'vitest';
import { compile, createRegistry } from '../src/index.ts';

const reg = createRegistry();
const codes = (doc: unknown) => compile(doc, reg).diagnostics.map((d) => [d.code, d.path, d.message]);

describe('envelope (URS-IN-002, URS-EXT-003)', () => {
  it('requires an object', () => {
    expect(codes([])).toEqual([['envelope.object', '', 'diagram must be a JSON object']]);
  });

  it('reports missing version and type together, listing registered types', () => {
    expect(codes({})).toEqual([
      ['envelope.version', '/version', "'version' is required (supported major: 1)"],
      ['envelope.type', '/type', "'type' is required (one of: flowchart, state, orgchart)"],
    ]);
  });

  it('rejects unknown majors and unknown types', () => {
    expect(codes({ version: '2', type: 'gantt' })).toEqual([
      ['envelope.version', '/version', "unsupported version '2' (supported major: 1)"],
      ['envelope.type', '/type', "unknown type 'gantt' (one of: flowchart, state, orgchart)"],
    ]);
  });

  it('accepts minor versions of the supported major', () => {
    expect(compile({ version: '1.3', type: 'flowchart', nodes: [] }, reg).diagnostics).toEqual([]);
  });
});
