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

test('renders Markdown with GFM, alerts, contents, math, code, diagrams and workspace links (URS-WS-040, WS-041)', async ({ page }) => {
  await open(page);
  const flow = JSON.stringify({ version: '1', type: 'flowchart', nodes: [{ id: 'a', label: 'Start', to: [{ node: 'b' }] }, { id: 'b', label: 'Finish' }] });
  const md = [
    '# Guide',
    '[[toc]]',
    '## Steps',
    '- [x] Draft',
    '- [ ] Review',
    '',
    '| Step | Days |',
    '|:--|--:|',
    '| Draft | 2 |',
    '',
    '> [!WARNING]',
    '> Check the ~~old~~ new flow.',
    '',
    'Area $\\pi r^2$ and see [the data](data.csv).',
    '',
    '```jtd',
    flow,
    '```',
    '',
    '```python',
    'def f(): return 1',
    '```',
  ].join('\n');
  await importFile(page, 'data.csv', 'a,b\n1,2\n');
  await importFile(page, 'guide.md', md);
  const view = page.locator('article.md');
  await expect(view.getByRole('heading', { name: 'Guide', level: 1 })).toBeVisible();
  await expect(view.getByRole('navigation', { name: 'Contents' }).getByRole('link', { name: 'Steps' })).toBeVisible();
  await expect(view.getByRole('checkbox', { name: 'Done', exact: true })).toBeChecked();
  await expect(view.getByRole('cell', { name: '2', exact: true })).toHaveCSS('text-align', 'right');
  await expect(view.getByRole('note')).toContainText('Warning');
  await expect(view.locator('del')).toHaveText('old');
  await expect(view.locator('math msup mi').first()).toHaveText('r');
  await expect(view.locator('.tok-keyword').first()).toHaveText('def');
  // The ```jtd block is drawn as the Preview draws diagrams.
  await expect(view.locator('figure.md-diagram svg')).toContainText('Finish');
  // A relative link opens the workspace file.
  await view.getByRole('link', { name: 'the data' }).click();
  await expect(page.locator('.toolbar__file')).toHaveText('data.csv');
  await expect(page.getByRole('table')).toBeVisible();
});

test('a collapsed <details> section hides everything up to </details>, code included; <!-- toc --> lists the headings (URS-WS-040, WS-042)', async ({ page }) => {
  await open(page);
  await importFile(page, 'notes.md', ['<!-- toc -->', '- [Old](#old)', '<!-- tocstop -->', '', '# Setup', '', '<details>', '<summary>Install steps</summary>', '', 'Run this:', '', '```sh', 'npm install', '```', '', '</details>', '', '## After'].join('\n'));
  const view = page.locator('article.md');
  const toc = view.getByRole('navigation', { name: 'Contents' });
  await expect(toc.getByRole('link')).toHaveText(['Setup', 'After']);
  // The generated list between the markers is replaced, not repeated.
  await expect(view.getByRole('link', { name: 'Old' })).toHaveCount(0);
  const code = view.locator('details pre');
  await expect(code).toHaveCount(1);
  await expect(code).toBeHidden();
  await view.getByText('Install steps').click();
  await expect(code).toBeVisible();
  await expect(view.locator('details')).toContainText('Run this:');
  await expect(view.getByRole('heading', { name: 'After' })).toBeVisible();
});

test('embeds workspace files in Markdown: a diagram drawn, a CSV as a table, Markdown and text (URS-WS-044)', async ({ page }) => {
  await open(page);
  const flow = JSON.stringify({ version: '1', type: 'flowchart', nodes: [{ id: 'a', label: 'Embedded start', to: [{ node: 'b' }] }, { id: 'b', label: 'Embedded end' }] });
  await importFile(page, 'flow.json', flow);
  await importFile(page, 'costs.csv', 'item,cost\nBolt,2\nNut,1\n');
  await importFile(page, 'part.md', '## Part two\n\nFrom another file.\n');
  await importFile(page, 'readme.txt', 'plain words');
  await importFile(page, 'doc.md', ['# Report', '', '![[flow.json|The approval flow]]', '', '![Costs](costs.csv)', '', '![[part.md]]', '', '![[readme.txt]]', '', '![[missing.json]]'].join('\n'));
  const view = page.locator('article.md').first();
  await expect(view.locator('figure.md-diagram svg')).toContainText('Embedded end');
  await expect(view.locator('figure.md-diagram figcaption')).toHaveText('The approval flow');
  const table = view.getByRole('table');
  await expect(table.getByRole('cell', { name: 'Bolt' })).toBeVisible();
  await expect(table.locator('caption')).toHaveText('Costs · 2 rows');
  await expect(view.getByRole('region', { name: 'part.md' }).getByRole('heading', { name: 'Part two' })).toBeVisible();
  await expect(view.locator('.md-embed-text')).toContainText('plain words');
  await expect(view.getByText('missing.json (no such file in the workspace)')).toBeVisible();
});
