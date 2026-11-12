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
  nodes: [{ id: 'ask', label: 'Request', style: { fill: '#ff0000' }, to: [{ node: 'pay', exitSide: 'S', style: { stroke: '#00ff00' } }] }, { id: 'pay', label: 'Pay' }],
};
const refined = {
  title: 'Refunds',
  direction: 'LR',
  nodes: [{ id: 'ask', shape: 'process', label: 'Request' }, { id: 'check', shape: 'decision', label: 'Eligible?' }, { id: 'pay', shape: 'process', label: 'Pay' }],
  edges: [{ from: 'ask', to: 'check' }, { from: 'check', to: 'pay', label: 'Yes' }, { from: 'ask', to: 'pay' }],
};

/** `current` with an eligibility check before paying: the model edits authoring source directly. */
const edited = {
  ...current,
  nodes: [
    { id: 'ask', label: 'Request', style: { fill: '#ff0000' }, to: [{ node: 'check' }, { node: 'pay', exitSide: 'S', style: { stroke: '#00ff00' } }] },
    { id: 'check', shape: 'decision', label: 'Eligible?', to: [{ node: 'pay', label: 'Yes' }] },
    { id: 'pay', label: 'Pay' },
  ],
};

describe('refine (URS-AI-013)', () => {
  it('sends the authoring source, the instruction, the full authoring schema and the examples', async () => {
    const client = new MockClaude([{ json: edited }]);
    const r = await refine({ source: current, instruction: 'Add an eligibility check before paying' }, opts(client));
    expect(r).toMatchObject({ type: 'flowchart', valid: true, attempts: 1, source: edited, diagnostics: [] });
    const req = client.requests[0]!;
    const sent = JSON.stringify(req.messages);
    expect(sent).toContain('Add an eligibility check before paying');
    expect(sent).toContain('\\"fill\\":\\"#ff0000\\"');
    // The authoring schema is outside the structured-output subset, so it goes as instructions.
    expect(req).toMatchObject({ schema: reg.type('flowchart')!.schema, strict: false });
    for (const ex of reg.type('flowchart')!.examples) expect(req.system).toContain(JSON.stringify(ex.source));
  });

  it('can change anything the language allows, e.g. lifecycle role lanes and owner colours', async () => {
    const cc = reg.type('lifecycle')!.examples[0]!.source as Record<string, unknown>;
    const reply = { ...cc, roleLanes: true, styleBy: { owner: { 'QA Reviewer': { fill: '#dbeafe' } } } };
    const r = await refine({ source: cc, instruction: 'Split workflows into role lanes and make QA blue' }, opts(new MockClaude([{ json: reply }])));
    expect(r).toMatchObject({ valid: true, source: reply, diagnostics: [] });
    expect(r.svg).toContain('#dbeafe');
  });

  it('repairs a reply that breaks the authoring schema', async () => {
    const client = new MockClaude([{ json: { ...edited, direction: 'sideways' } }, { json: edited }]);
    const r = await refine({ source: current, instruction: 'x' }, opts(client));
    expect(r).toMatchObject({ valid: true, attempts: 2, source: edited });
    expect(JSON.stringify(client.requests[1]!.messages.at(-1))).toContain('/direction');
  });

  it('warns when the instruction changed nothing', async () => {
    const r = await refine({ source: current, instruction: 'Make it blue' }, opts(new MockClaude([{ json: { ...current } }])));
    expect(r.valid).toBe(true);
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([['warning', 'ai.unchanged']]);
  });

  it('refuses empty instructions and unknown types', async () => {
    const client = new MockClaude([]);
    expect(await code(refine({ source: current, instruction: '  ' }, opts(client)))).toBe('ai.input');
    expect(await code(refine({ source: { version: '1', type: 'gantt' }, instruction: 'x' }, opts(client)))).toBe('ai.input');
  });

  it('accepts invalid sources, since fixing them can be the instruction', async () => {
    for (const broken of [{ ...current, nodes: [{ id: 'ask', to: [{ node: 'ghost' }] }] }, { ...current, nodes: 'x' }]) {
      const r = await refine({ source: broken, instruction: 'fix it' }, opts(new MockClaude([{ json: edited }])));
      expect(r.valid).toBe(true);
    }
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
