import { test } from '@playwright/test';
import { open } from './helpers.ts';

/** README screenshots of the web app (URS-DOC-005). Run with `pnpm docs:screens`. */
test('web app', async ({ page }) => {
  await open(page);
  await page.getByLabel('Example').selectOption({ label: 'Flowchart: Cross-functional flowchart' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../../docs/img/web-app.png' });
});
