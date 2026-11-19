import { expect, test, type Page } from '@playwright/test';
import { open, setSource } from './helpers.ts';

const item = (page: Page, name: string) => page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name, exact: true });

async function importFile(page: Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles([{ name, mimeType: 'text/plain', buffer: Buffer.from(text) }]);
  await item(page, name).click();
}

test('shows a large CSV as a table that draws only what is in view, sorts and reports problems (URS-WS-012, WS-013)', async ({ page }) => {
  await open(page);
  const big = `id,name,amount\n${Array.from({ length: 100_000 }, (_, i) => `${i + 1},"Item ${i + 1}, boxed",${((i * 37) % 1000) + 0.5}`).join('\n')}\n`;
  await importFile(page, 'big.csv', big);
  const table = page.getByRole('table');
  await expect(page.getByText('100,000 rows · 3 columns · separated by commas')).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'amount' })).toBeVisible();
  // Only rows near the view are in the page.
  expect(await table.locator('tbody tr').count()).toBeLessThan(120);
  await expect(table.getByRole('cell', { name: 'Item 1, boxed', exact: true })).toBeVisible();
  // Numbers align right.
  await expect(table.getByRole('cell', { name: '0.5', exact: true }).first()).toHaveCSS('text-align', 'end');

  // Scroll to the end: the last row is drawn.
  await page.getByLabel('Table').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(table.getByRole('cell', { name: 'Item 100000, boxed', exact: true })).toBeVisible();

  // Sort the view by amount, descending; the file is untouched.
  await page.getByLabel('Table').evaluate((el) => (el.scrollTop = 0));
  const amount = table.getByRole('columnheader', { name: 'amount' });
  await amount.getByRole('button').click();
  await amount.getByRole('button').click();
  await expect(amount).toHaveAttribute('aria-sort', 'descending');
  await expect(table.locator('tbody tr').first().locator('td').nth(3)).toHaveText('999.5');
  await expect(page.locator('.cm-content')).toContainText('id,name,amount');

  await importFile(page, 'bad.tsv', 'a\tb\n1\t2\t3\n"open\t4\n');
  await expect(page.getByRole('list', { name: 'Problems' })).toContainText('Line 2: row has 3 fields; the header has 2');
  await expect(page.getByText('separated by tabs')).toBeVisible();
  // Edits show as they are typed.
  await setSource(page, 'x\ty\n7\t8\n');
  await expect(page.getByRole('table').getByRole('cell', { name: '8', exact: true })).toBeVisible();
});
