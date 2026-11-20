import { expect, test, type Download, type Page } from '@playwright/test';
import { open, setSource, status } from './helpers.ts';

const item = (page: Page, name: string) => page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name, exact: true });
const command = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
const bytes = async (d: Download) => Buffer.concat(await (await d.createReadStream()).toArray());
/** Text a PDF shows: its hex strings, decoded as Windows-1252 (ASCII here). */
const pdfText = (b: Buffer) => [...b.toString('latin1').matchAll(/<([0-9a-f]*)> Tj/g)].map((m) => Buffer.from(m[1]!, 'hex').toString('latin1')).join('\n');

async function importFiles(page: Page, files: Record<string, string>) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles(Object.entries(files).map(([name, text]) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })));
}

test('exports the diagram on screen as a vector PDF, from the toolbar (URS-WS-046)', async ({ page }) => {
  await open(page);
  await setSource(page, { version: '1', type: 'flowchart', title: 'Refunds', nodes: [{ id: 'a', label: 'Ask for refund', to: [{ node: 'b', label: 'valid' }] }, { id: 'b', shape: 'decision', label: 'Approve?' }] });
  await expect(status(page)).toHaveText('Valid');
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PDF' }).click()]);
  expect(d.suggestedFilename()).toBe('Untitled.pdf');
  const b = await bytes(d);
  expect(b.subarray(0, 8).toString()).toBe('%PDF-1.4');
  expect(b.toString('latin1')).toContain('/Count 1');
  // Text stays text, and shapes are paths (curves for the rounded ends), not a picture.
  const text = pdfText(b);
  for (const t of ['Refunds', 'Ask for refund', 'Approve?', 'valid']) expect(text).toContain(t);
  expect(b.toString('latin1')).toMatch(/ c\n/);
  expect(b.toString('latin1')).not.toContain('/Image');
});

test('exports Markdown, CSV and text files as PDF, and CSV as Excel, from the context menu (URS-WS-045, WS-046)', async ({ page }) => {
  await open(page);
  const flow = JSON.stringify({ version: '1', type: 'flowchart', nodes: [{ id: 'a', label: 'Embedded step' }] });
  await importFiles(page, {
    'flow.json': flow,
    'costs.csv': 'item,cost\nBolt,"1,200"\nNut,15%\n',
    'notes.txt': 'line one\nline two',
    'report.md': ['# Quarterly report', '', 'Some **bold** words and `code`.', '', '- [x] Done item', '- Next', '', '| Name | Value |', '|--|--:|', '| Alpha | 1 |', '', '![[flow.json|The flow]]', '', '![[costs.csv]]', '', '```js', 'const x = 1;', '```'].join('\n'),
  });

  await item(page, 'report.md').click({ button: 'right' });
  let [d] = await Promise.all([page.waitForEvent('download'), command(page, 'Export as PDF').click()]);
  expect(d.suggestedFilename()).toBe('report.pdf');
  let text = pdfText(await bytes(d));
  for (const t of ['Quarterly report', 'bold', 'Done item', 'Alpha', 'Embedded step', 'The flow', 'Bolt', 'const x = 1;', '1 / 1']) expect(text).toContain(t);

  await item(page, 'costs.csv').click({ button: 'right' });
  // Only tables offer Excel.
  [d] = await Promise.all([page.waitForEvent('download'), command(page, 'Export as Excel').click()]);
  expect(d.suggestedFilename()).toBe('costs.xlsx');
  const xlsx = await bytes(d);
  expect(xlsx.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']) expect(xlsx.includes(Buffer.from(part))).toBe(true);
  await item(page, 'costs.csv').click({ button: 'right' });
  [d] = await Promise.all([page.waitForEvent('download'), command(page, 'Export as PDF').click()]);
  text = pdfText(await bytes(d));
  for (const t of ['item', 'Bolt', '1,200', '15%']) expect(text).toContain(t);

  await item(page, 'notes.txt').click({ button: 'right' });
  await expect(command(page, 'Export as Excel')).toHaveCount(0);
  [d] = await Promise.all([page.waitForEvent('download'), command(page, 'Export as PDF').click()]);
  expect(pdfText(await bytes(d))).toContain('line two');
});
