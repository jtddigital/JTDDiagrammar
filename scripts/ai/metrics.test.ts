import { createRegistry } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { CORPUS } from './corpus.ts';
import { score, similar } from './metrics.ts';

const reg = createRegistry();

describe('evaluation metrics (URS-AI-018)', () => {
  it('matches labels fuzzily', () => {
    expect(similar('Submit claim', 'Employee submits the claim')).toBe(true);
    expect(similar('Check policy', 'Check against policy')).toBe(true);
    expect(similar('Reimburse', 'Pay invoice')).toBe(false);
  });

  it('scores recall and lane accuracy through the IR', () => {
    const src = {
      version: '1',
      type: 'flowchart',
      lanes: [{ id: 'e', label: 'Employee' }, { id: 'f', label: 'Finance' }],
      nodes: [{ id: 'a', label: 'Submit claim', lane: 'e', to: [{ node: 'b' }] }, { id: 'b', label: 'Reimburse claim', lane: 'e' }],
    };
    expect(score(src, { nodes: ['Submit claim', 'Reimburse', 'Approve'], edges: [['Submit claim', 'Reimburse'], ['Approve', 'Reimburse']], lanes: { 'Submit claim': 'Employee', Reimburse: 'Finance' } }, reg)).toEqual({
      nodeRecall: 2 / 3,
      edgeRecall: 1 / 2,
      laneAccuracy: 1 / 2,
    });
  });

  it('scores invalid output as zero, and the corpus covers every built-in type', () => {
    expect(score({ version: '1', type: 'flowchart' }, { nodes: ['x'] }, reg)).toEqual({ nodeRecall: 0, edgeRecall: 0 });
    const covered = new Set(CORPUS.map((c) => c.type));
    for (const t of reg.types()) expect(covered.has(t.id) || covered.has('auto'), t.id).toBe(true);
    expect([...covered]).toEqual(expect.arrayContaining(['flowchart', 'state', 'orgchart', 'auto']));
  });
});
