import { expect, test } from '@playwright/test';
import { open, setSource, status } from './helpers.ts';

const pane = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true });

test('shows the panes, which can be hidden, but not all of them (URS-WEB-015)', async ({ page }) => {
  await open(page);
  for (const name of ['Files', 'AI', 'Source', 'Preview']) await expect(pane(page, name)).toBeVisible();
  const toggle = (name: string) => page.getByRole('group', { name: 'Panes' }).getByRole('button', { name });
  await toggle('AI').click();
  await expect(pane(page, 'AI')).toHaveCount(0);
  await expect(toggle('AI')).toHaveAttribute('aria-pressed', 'false');
  await toggle('Source').click();
  await toggle('Files').click();
  await toggle('Preview').click();
  await expect(pane(page, 'Preview')).toBeVisible();
  // Remembered across reloads.
  await page.reload();
  await expect(pane(page, 'AI')).toHaveCount(0);
  await expect(pane(page, 'Source')).toHaveCount(0);
  await toggle('Source').click();
  await expect(pane(page, 'Source')).toBeVisible();
});

test('resizes panes by dragging or with the keyboard (URS-WEB-015)', async ({ page }) => {
  await open(page);
  const gutter = page.getByRole('separator', { name: 'Resize Source and Preview' });
  const width = async () => (await pane(page, 'Source').boundingBox())!.width;
  const w0 = await width();
  await gutter.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await width()).toBeGreaterThan(w0 + 20);

  const box = (await gutter.boundingBox())!;
  const w1 = await width();
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x - 100, box.y + 200, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBeCloseTo(w1 - 100, -1);
  // Never below the minimum.
  await page.mouse.move(box.x - 100, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(0, box.y + 200, { steps: 5 });
  await page.mouse.up();
  expect(await width()).toBeGreaterThanOrEqual(239);
});

test('clicking a problem jumps to it in the source (URS-WEB-018)', async ({ page }) => {
  await open(page);
  await setSource(page, { version: '1', type: 'flowchart', nodes: [{ id: 'a', to: [{ node: 'b' }] }, { id: 'b', shape: 'star' }] });
  await expect(status(page)).toHaveText('1 error');
  await page.locator('.cm-content').press('ControlOrMeta+Home');
  await page.getByLabel('Diagnostics').getByRole('button').first().click();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('"shape"');
});
