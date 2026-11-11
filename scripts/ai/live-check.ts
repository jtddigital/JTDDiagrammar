/**
 * Live check of AI generation against the real Claude API (URS-AI-018, smoke subset).
 * Costs real money (a few cents per run); never runs in CI. Usage: ANTHROPIC_API_KEY=… pnpm ai:live
 * Results are written to .live/ for inspection.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { AiError, anthropicClient, generate, type Effort } from '@jtd/ai';
import { createRegistry, render } from '@jtd/core';
import { CASES } from './cases.ts';

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('Set ANTHROPIC_API_KEY to run the live check. It calls the real Claude API and costs a few cents.');
  process.exit(2);
}

const model = process.env.AI_MODEL ?? 'claude-opus-5-5';
const effort = (process.env.AI_EFFORT ?? 'high') as Effort;
const reg = createRegistry();
const client = anthropicClient({ model, effort, fallbacks: process.env.AI_FALLBACKS !== 'off' });
const out = new URL('../../.live/', import.meta.url);
mkdirSync(out, { recursive: true });

const rows = [];
let failed = 0;
for (const c of CASES) {
  const t0 = performance.now();
  try {
    const r = await generate(
      { text: c.text, files: [], type: c.type },
      { registry: reg, client, render: async (s) => render(s, reg), maxRepairs: 2, maxInputTokens: 200_000, limits: { maxFiles: 5, maxFileBytes: 20e6, maxTotalBytes: 20e6 } },
    );
    const slug = c.name.replace(/\W+/g, '-');
    writeFileSync(new URL(`${slug}.json`, out), `${JSON.stringify(r.source, null, 2)}\n`);
    if (r.svg) writeFileSync(new URL(`${slug}.svg`, out), r.svg);
    const problems = c.check(r);
    failed += problems.length ? 1 : 0;
    rows.push({ case: c.name, valid: r.valid, attempts: r.attempts, in: r.usage.input, out: r.usage.output, cacheRead: r.usage.cacheRead, cacheWrite: r.usage.cacheWrite, seconds: ((performance.now() - t0) / 1000).toFixed(1), result: problems.join('; ') || 'pass' });
  } catch (e) {
    failed++;
    rows.push({ case: c.name, result: e instanceof AiError ? `${e.code}: ${e.message}` : String(e) });
  }
}
console.log(`model ${model}, effort ${effort}`);
console.table(rows);
process.exit(failed ? 1 : 0);
