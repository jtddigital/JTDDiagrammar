import { describe, expect, it } from 'vitest';
import type { GraphIR } from '../src/index.ts';
import { validateIR } from '../src/validate/common.ts';

const ir = (over: Partial<GraphIR>): GraphIR => ({ direction: 'LR', nodes: [], edges: [], containers: [], ...over });
const node = (id: string, extra = {}) => ({ id, shape: 'process', label: id, src: `/n/${id}`, ...extra });
const codes = (g: GraphIR) => validateIR(g).map((d) => [d.code, d.path]);

describe('common IR rules (URS-IN-005, URS-DM-005)', () => {
  it('flags duplicate node and edge ids', () => {
    const g = ir({
      nodes: [node('a'), node('a')],
      edges: [{ id: 'e', from: 'a', to: 'a', src: '/e/0' }, { id: 'e', from: 'a', to: 'a', src: '/e/1' }],
    });
    expect(codes(g)).toEqual([['id.duplicate', '/n/a'], ['id.duplicate', '/e/1']]);
  });

  it('flags dangling edge endpoints but allows edges to containers', () => {
    const g = ir({ nodes: [node('a')], containers: [{ id: 'c' }], edges: [{ id: 'e', from: 'a', to: 'c' }, { id: 'f', from: 'a', to: 'x', src: '/e/1' }] });
    expect(codes(g)).toEqual([['ref.edge', '/e/1']]);
  });

  it('flags unknown parents and parent cycles', () => {
    const g = ir({
      nodes: [node('a', { parent: 'nope' })],
      containers: [{ id: 'c1', parent: 'c2', src: '/c/1' }, { id: 'c2', parent: 'c1', src: '/c/2' }],
    });
    expect(codes(g)).toEqual([['ref.parent', '/n/a'], ['ref.cycle', '/c/1'], ['ref.cycle', '/c/2']]);
  });

  it('requires valid lane and phase assignments when partitioned', () => {
    const g = ir({
      partitions: { lanes: [{ id: 'l', label: 'L' }], phases: [{ id: 'p', label: 'P' }] },
      nodes: [node('ok', { lane: 'l', phase: 'p' }), node('none'), node('bad', { lane: 'x', phase: 'y' })],
    });
    expect(codes(g)).toEqual([
      ['ref.lane', '/n/none'],
      ['ref.phase', '/n/none'],
      ['ref.lane', '/n/bad'],
      ['ref.phase', '/n/bad'],
    ]);
  });

  it('rejects a phase reference when no phases exist', () => {
    const g = ir({ partitions: { lanes: [{ id: 'l', label: 'L' }] }, nodes: [node('a', { lane: 'l', phase: 'p' })] });
    expect(codes(g)).toEqual([['ref.phase', '/n/a']]);
  });
});
