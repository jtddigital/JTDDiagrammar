import { describe, expect, it } from 'vitest';
import { createRegistry, render } from '../src/index.ts';
import { goldenFixtures } from './fixtures.ts';

const reg = createRegistry();

/** Golden SVGs (URS-NF-003). Review diffs, then update deliberately with `pnpm test -u`. */
describe('golden SVG', () => {
  it.each(goldenFixtures())('%s', async (name, doc) => {
    const { svg } = render(doc, reg);
    await expect(svg).toMatchFileSnapshot(`./golden/${name}.svg`);
  });
});
