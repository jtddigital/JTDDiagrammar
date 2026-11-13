import { expect, it } from 'vitest';
import { createRegistry, render } from '../src/index.ts';

/**
 * URS-LY-010: 200 nodes / 300 edges laid out in < 500 ms on the server. Runs in its own vitest
 * invocation (`pnpm test:budget`): no coverage instrumentation and no other test files in parallel.
 */
const BUDGET_MS = 500;
const reg = createRegistry();

const graph = (seed: number, n: number, m: number) => {
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Step ${i}`, to: [] as { node: string }[] }));
  for (let i = 0; i < m; i++) nodes[Math.floor(rnd() * n)]!.to.push({ node: `n${Math.floor(rnd() * n)}` });
  return { version: '1', type: 'flowchart', nodes };
};

/** CPU time of this process, which other processes sharing the machine do not inflate. */
const cpuMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

it(`lays out 200 nodes / 300 edges in < ${BUDGET_MS} ms (URS-LY-010)`, () => {
  // A running server has already laid out large diagrams, so its JIT is warm: warm up on another
  // graph of the same size (render keeps no per-document cache), then take the best of five.
  const warm = graph(11, 200, 300);
  for (let i = 0; i < 3; i++) render(warm, reg);
  const doc = graph(7, 200, 300);
  const runs = Array.from({ length: 5 }, () => {
    const t = cpuMs();
    expect(render(doc, reg).svg).toBeDefined();
    return cpuMs() - t;
  });
  console.log(`URS-LY-010: 200/300 layout CPU ms ${runs.map((r) => r.toFixed(0)).join(', ')} (budget ${BUDGET_MS})`);
  expect(Math.min(...runs)).toBeLessThan(BUDGET_MS);
});
