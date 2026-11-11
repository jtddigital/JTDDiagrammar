import { createRegistry, render } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { AiError } from '../src/errors.ts';
import { generate, refine, type GenerateOptions, type Progress } from '../src/generate.ts';
import { ingest } from '../src/ingest/files.ts';
import { MockClaude, type ScriptedReply } from '../src/mock.ts';
import { cost, PRICES } from '../src/pricing.ts';

const reg = createRegistry();
const opts = (client: MockClaude, over: Partial<GenerateOptions> = {}): GenerateOptions => ({
  registry: reg,
  client,
  render: async (s) => render(s, reg),
  maxRepairs: 1,
  maxInputTokens: 10_000,
  limits: { maxFiles: 5, maxFileBytes: 1e6, maxTotalBytes: 1e6 },
  ...over,
});
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof AiError ? e.code : String(e)));

const current = {
  version: '1',
  type: 'flowchart',
  title: 'Refunds',
  theme: 'dark',
  nodes: [{ id: 'ask', label: 'Request', style: { fill: '#ff0000' } }, { id: 'pay', label: 'Pay' }],
  edges: [{ from: 'ask', to: 'pay', fromSide: 'S', style: { stroke: '#00ff00' } }],
};
const refined = {
  title: 'Refunds',
  direction: 'LR',
  nodes: [{ id: 'ask', shape: 'process', label: 'Request' }, { id: 'check', shape: 'decision', label: 'Eligible?' }, { id: 'pay', shape: 'process', label: 'Pay' }],
  edges: [{ from: 'ask', to: 'check' }, { from: 'check', to: 'pay', label: 'Yes' }, { from: 'ask', to: 'pay' }],
};

describe('refine (URS-AI-013)', () => {
  it('sends the current diagram and the instruction, and keeps styles, hints and theme', async () => {
    const client = new MockClaude([{ json: refined }]);
    const r = await refine({ source: current, instruction: 'Add an eligibility check before paying' }, opts(client));
    expect(r).toMatchObject({ type: 'flowchart', valid: true, attempts: 1 });
    const sent = JSON.stringify(client.requests[0]!.messages);
    expect(sent).toContain('Add an eligibility check before paying');
    expect(sent).toContain('\\"id\\":\\"ask\\"');
    const src = r.source as typeof current;
    expect(src.theme).toBe('dark');
    expect(src.nodes.find((n) => n.id === 'ask')!.style).toEqual({ fill: '#ff0000' });
    expect(src.edges.find((e) => e.from === 'ask' && e.to === 'pay')).toMatchObject({ fromSide: 'S', style: { stroke: '#00ff00' } });
  });

  it('refuses empty instructions and structurally invalid sources', async () => {
    const client = new MockClaude([]);
    expect(await code(refine({ source: current, instruction: '  ' }, opts(client)))).toBe('ai.input');
    expect(await code(refine({ source: { ...current, nodes: 'x' }, instruction: 'x' }, opts(client)))).toBe('ai.input');
    expect(await code(refine({ source: { version: '1', type: 'gantt' }, instruction: 'x' }, opts(client)))).toBe('ai.input');
  });

  it('accepts semantically invalid sources, since fixing them can be the instruction', async () => {
    const broken = { ...current, edges: [{ from: 'ask', to: 'ghost' }] };
    const r = await refine({ source: broken, instruction: 'fix the dangling edge' }, opts(new MockClaude([{ json: refined }])));
    expect(r.valid).toBe(true);
  });
});

describe('progress (URS-AI-015)', () => {
  it('reports stages in order, including repairs', async () => {
    const bad = { ...refined, edges: [{ from: 'ask', to: 'nowhere' }] };
    const seen: Progress[] = [];
    await generate({ type: 'flowchart', text: 'x', files: [], onProgress: (p) => seen.push(p) }, opts(new MockClaude([{ json: bad }, { json: refined }])));
    expect(seen).toEqual([
      { stage: 'ingest' },
      { stage: 'generate', attempt: 1 },
      { stage: 'validate', attempt: 1 },
      { stage: 'repair', attempt: 2 },
      { stage: 'validate', attempt: 2 },
    ]);
  });
});

describe('cost (URS-AI-017)', () => {
  it('prices each reply by the model that served it', () => {
    expect(cost('claude-opus-5-5', { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 })).toBeCloseTo(4 + 20 + 0.2 + 5);
    expect(cost('unknown-model', { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeUndefined();
    expect(Object.keys(PRICES)).toContain('claude-sonnet-5-5');
  });

  it('reports a total, or none when any model is unpriced', async () => {
    const priced: ScriptedReply = { json: refined, model: 'claude-opus-5-5' };
    const r = await generate({ type: 'flowchart', text: 'x', files: [] }, opts(new MockClaude([priced])));
    expect(r.usage.costUsd).toBeCloseTo((100 * 4 + 50 * 20 + 80 * 0.2) / 1e6, 9);
    const unpriced = await generate({ type: 'flowchart', text: 'x', files: [] }, opts(new MockClaude([{ json: refined }])));
    expect(unpriced.usage.costUsd).toBeUndefined();
  });
});

describe('image input (URS-AI-021)', () => {
  it('sends images as image blocks', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const blocks = await ingest([{ name: 'whiteboard.PNG', data: png }, { name: 'photo', mediaType: 'image/jpeg', data: png }], undefined, { maxFiles: 5, maxFileBytes: 1e6, maxTotalBytes: 1e6 });
    expect(blocks).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(png).toString('base64') } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(png).toString('base64') } },
    ]);
  });
});
