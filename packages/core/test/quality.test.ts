import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRegistry, render } from '../src/index.ts';
import { GATED, quality } from '../src/layout/metrics.ts';
import { BASELINE_FILE, qualityFixtures } from './quality-fixtures.ts';

const reg = createRegistry();
const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Record<string, Record<string, number>>;

/** Quality ratchet: no metric may get worse on any fixture; lower the baseline with `pnpm quality --update`. */
describe.each(qualityFixtures())('layout quality: %s', (name, doc) => {
  const q = quality(render(doc, reg).geometry!);

  it('has a baseline', () => expect(baseline[name]).toBeDefined());

  it.each(GATED)('%s does not regress (URS-LY-006..008)', (k) => {
    expect(q[k]).toBeLessThanOrEqual(baseline[name]![k]!);
  });

  it('no edge passes through a node (URS-LY-006)', () => expect(q.edgeThroughNode).toBe(0));

  it('no label overlaps a node or header (URS-LY-008)', () => expect(q.labelOnNode).toBe(0));
});
