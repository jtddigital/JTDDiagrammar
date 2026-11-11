import { test } from '@playwright/test';
import { open } from './helpers.ts';

/** README screenshots of the web app (URS-DOC-005). Run with `pnpm docs:screens`. */
test('web app', async ({ page }) => {
  await open(page);
  await page.getByLabel('Example').selectOption({ label: 'Flowchart: Cross-functional flowchart' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../../docs/img/web-app.png' });
});

test('generate panel', async ({ page }) => {
  // Screenshot only: AI calls are mocked so no key or spend is involved.
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5' } }));
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await page
    .getByLabel('Material')
    .fill('Expense claims: the employee submits a claim with receipts. Their manager checks it against policy and either approves it or returns it for changes. Finance reimburses approved claims within five days.');
  await page.screenshot({ path: '../../docs/img/web-generate.png' });
});
