/**
 * Accuracy evaluation of AI generation against the corpus (URS-AI-018). Calls the real Claude API:
 * costs real money (roughly 6-15 calls), never runs in CI. Usage: ANTHROPIC_API_KEY=… pnpm ai:eval
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { AiError, anthropicClient, generate, type Effort } from '@jtd/ai';
import { createRegistry, render } from '@jtd/core';
import { CORPUS } from './corpus.ts';
import { score } from './metrics.ts';

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('Set ANTHROPIC_API_KEY to run the evaluation. It calls the real Claude API and costs money.');
  process.exit(2);
}

const reg = createRegistry();
const model = process.env.AI_MODEL ?? 'claude-opus-5-5';
const client = anthropicClient({ model, effort: (process.env.AI_EFFORT ?? 'high') as Effort, fallbacks: process.env.AI_FALLBACKS !== 'off' });
const rows: Record<string, unknown>[] = [];
for (const c of CORPUS) {
  try {
    const r = await generate({ type: c.type, text: c.text, files: [] }, { registry: reg, client, render: async (s) => render(s, reg), maxRepairs: 2, maxInputTokens: 200_000, limits: { maxFiles: 5, maxFileBytes: 2e7, maxTotalBytes: 2e7 } });
    rows.push({ case: c.name, type: r.type, validFirst: r.valid && r.attempts === 1, valid: r.valid, attempts: r.attempts, ...score(r.source, c.expected, reg), costUsd: r.usage.costUsd });
  } catch (e) {
    rows.push({ case: c.name, error: e instanceof AiError ? e.code : String(e) });
  }
}
const mean = (k: string) => {
  const xs = rows.map((r) => r[k]).filter((v): v is number | boolean => typeof v === 'number' || typeof v === 'boolean').map(Number);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : undefined;
};
console.log(`model ${model}`);
console.table(rows);
const summary = { validFirst: mean('validFirst'), valid: mean('valid'), nodeRecall: mean('nodeRecall'), edgeRecall: mean('edgeRecall'), laneAccuracy: mean('laneAccuracy') };
console.log('summary', summary);
mkdirSync(new URL('../../.live/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../.live/eval.json', import.meta.url), `${JSON.stringify({ model, rows, summary }, null, 2)}\n`);
