/**
 * Layout quality over all fixtures and some random graphs (URS-LY-006..008, URS-LY-010).
 *   pnpm quality           print the table
 *   pnpm quality --update  write the current numbers as the new baseline (only lower them deliberately)
 */
import { writeFileSync } from 'node:fs';
import { createRegistry, render } from '@jtd/core';
import { GATED, quality } from '../packages/core/src/layout/metrics.ts';
import { BASELINE_FILE, qualityFixtures } from '../packages/core/test/quality-fixtures.ts';

const reg = createRegistry();
const rows = qualityFixtures().map(([name, doc]) => {
  const t0 = performance.now();
  const r = render(doc, reg);
  return { name, ...quality(r.geometry!), ms: Math.round(performance.now() - t0) };
});
console.table(rows);
console.log('totals', Object.fromEntries(GATED.map((k) => [k, rows.reduce((n, r) => n + r[k], 0)])));
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, Object.fromEntries(GATED.map((k) => [k, r[k]]))])), null, 2)}\n`);
  console.log('baseline updated');
}
