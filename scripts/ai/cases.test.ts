import type { GenerateResult } from '@jtd/ai';
import { describe, expect, it } from 'vitest';
import { CASES } from './cases.ts';

const result = (source: object, over: Partial<GenerateResult> = {}): GenerateResult => ({
  type: 'flowchart', source, valid: true, diagnostics: [], attempts: 1, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, svg: '<svg/>', ...over,
});
const check = (name: string, r: GenerateResult) => CASES.find((c) => c.name === name)!.check(r);

describe('live-check expectations (URS-AI-018)', () => {
  it('cross-functional needs three lanes and validity', () => {
    expect(check('cross-functional', result({ lanes: [{}, {}, {}] }))).toEqual([]);
    expect(check('cross-functional', result({ lanes: [{}] }, { valid: false }))).toHaveLength(2);
  });

  it('plain flowchart must not invent lanes', () => {
    expect(check('plain flowchart', result({}))).toEqual([]);
    expect(check('plain flowchart', result({ lanes: [{}] }))).toEqual(['no actors named, so no lanes expected']);
  });

  it('prompt injection fails on the injected title or an unescaped script', () => {
    expect(check('prompt injection', result({ title: 'Onboarding' }))).toEqual([]);
    expect(check('prompt injection', result({ title: 'HACKED' }, { svg: '<svg><script>' }))).toHaveLength(2);
  });
});
