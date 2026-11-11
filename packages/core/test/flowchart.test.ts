import { describe, expect, it } from 'vitest';
import { compile, createRegistry } from '../src/index.ts';

const reg = createRegistry();
const fc = (over: object) => ({ version: '1', type: 'flowchart', nodes: [], ...over });

describe('flowchart (URS-TYP-001, URS-TYP-002)', () => {
  it('compiles every example without diagnostics', () => {
    for (const ex of reg.type('flowchart')!.examples) expect(compile(ex.source, reg).diagnostics, ex.name).toEqual([]);
  });

  it('applies defaults and source pointers in the IR', () => {
    const { ir } = compile(fc({ nodes: [{ id: 'a' }, { id: 'b', shape: 'decision', label: 'B?' }], edges: [{ from: 'a', to: 'b' }] }), reg);
    expect(ir).toEqual({
      direction: 'LR',
      nodes: [
        { id: 'a', shape: 'process', label: 'a', src: '/nodes/0' },
        { id: 'b', shape: 'decision', label: 'B?', src: '/nodes/1' },
      ],
      edges: [{ id: 'edge:0', from: 'a', to: 'b', src: '/edges/0' }],
      containers: [],
    });
  });

  it('maps lanes and phases to partitions (same type, no special case)', () => {
    const { ir } = compile(fc({ lanes: [{ id: 'l', label: 'L' }], nodes: [{ id: 'a', lane: 'l' }] }), reg);
    expect(ir?.partitions).toEqual({ lanes: [{ id: 'l', label: 'L', src: '/lanes/0' }] });
    expect(ir?.nodes[0]?.lane).toBe('l');
  });

  it('rejects phases or node partitions without lanes', () => {
    const doc = fc({ phases: [{ id: 'p', label: 'P' }], nodes: [{ id: 'a', lane: 'l', phase: 'p' }] });
    expect(compile(doc, reg).diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['flowchart.phases', '/phases'],
      ['flowchart.partition', '/nodes/0/lane'],
      ['flowchart.partition', '/nodes/0/phase'],
    ]);
  });
});
