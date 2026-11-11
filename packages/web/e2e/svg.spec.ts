import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** Every generated SVG opens as a standalone document and renders (URS-RN-001), in each browser project. */
const root = new URL('../../../', import.meta.url).pathname;
const files = [
  ...readdirSync(`${root}docs/img`).filter((f) => f.endsWith('.svg')).map((f) => `${root}docs/img/${f}`),
  ...readdirSync(`${root}packages/core/test/golden`).filter((f) => f.endsWith('.svg')).map((f) => `${root}packages/core/test/golden/${f}`),
];

for (const file of files)
  test(`opens ${file.split('/').slice(-2).join('/')}`, async ({ page }) => {
    await page.goto(`file://${file}`);
    const info = await page.evaluate(() => {
      const el = document.documentElement as unknown as SVGSVGElement;
      return { name: el.localName, ns: el.namespaceURI, parseError: document.getElementsByTagName('parsererror').length, w: el.getBBox().width, h: el.getBBox().height };
    });
    expect(info).toMatchObject({ name: 'svg', ns: 'http://www.w3.org/2000/svg', parseError: 0 });
    expect(info.w * info.h).toBeGreaterThan(0);
  });
