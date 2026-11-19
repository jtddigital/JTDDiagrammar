import { expect, it } from 'vitest';
import { diff, type Op } from '../src/index.ts';

/**
 * URS-WS-030: two 10,000-line files differ in under 200 ms. Runs in its own vitest invocation
 * (`pnpm test:budget`): no coverage instrumentation and no other test files in parallel.
 */
const BUDGET_MS = 200;

function random(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
}

const apply = <T>(a: T[], b: T[], ops: Op[]) =>
  ops.flatMap((op) => (op.type === 'same' ? a.slice(op.a, op.a + op.n) : op.type === 'ins' ? b.slice(op.b, op.b + op.n) : []));

/** CPU time of this process, which other processes sharing the machine do not inflate. */
const cpuMs = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

it(`compares two 10,000-line files in < ${BUDGET_MS} ms, even when every line differs (URS-WS-030)`, () => {
  const rnd = random(3);
  const a = Array.from({ length: 10_000 }, (_, i) => `line ${i} ${Math.floor(rnd() * 1e6)}`);
  const edited = a.map((l) => (rnd() < 0.05 ? `${l} edited` : l)).filter((_, i) => i % 97 !== 0);
  edited.splice(5000, 0, ...Array.from({ length: 300 }, (_, i) => `new ${i}`));
  const cases = { edited, rewritten: a.map((l) => `${l}!`), reversed: [...a].reverse() };
  // Warm the JIT as an open app would be, then take the best of three.
  diff(a.slice(0, 2000), edited.slice(0, 2000));
  for (const [name, b] of Object.entries(cases)) {
    const runs = Array.from({ length: 3 }, () => {
      const t = cpuMs();
      const ops = diff(a, b);
      const ms = cpuMs() - t;
      expect(apply(a, b, ops), name).toEqual(b);
      return ms;
    });
    expect(Math.min(...runs), name).toBeLessThan(BUDGET_MS);
  }
});
