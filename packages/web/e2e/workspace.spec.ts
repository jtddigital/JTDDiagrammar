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

test('docks a pane by dragging its header: stacked in a column or beside another (URS-WEB-024)', async ({ page }) => {
  await open(page);
  const box = async (name: string) => (await pane(page, name).boundingBox())!;
  const dragTo = async (name: string, target: string, fx: number, fy: number) => {
    const from = (await pane(page, name).locator('.pane__title').boundingBox())!;
    const to = await box(target);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width * fx, to.y + to.height * fy, { steps: 8 });
    await expect(page.locator('.dock-hint')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.dock-hint')).toHaveCount(0);
  };

  // Files below Source: one column, Source on top.
  await dragTo('Files', 'Source', 0.5, 0.9);
  let [files, source] = [await box('Files'), await box('Source')];
  expect(Math.abs(files.x - source.x)).toBeLessThan(2);
  expect(files.y).toBeGreaterThan(source.y + source.height - 2);
  // Remembered across reloads.
  await page.reload();
  [files, source] = [await box('Files'), await box('Source')];
  expect(Math.abs(files.x - source.x)).toBeLessThan(2);

  // The gutter between them resizes their heights.
  const gutter = page.getByRole('separator', { name: 'Resize Source and Files' });
  await expect(gutter).toHaveAttribute('aria-orientation', 'horizontal');
  const h0 = (await box('Source')).height;
  await gutter.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect((await box('Source')).height).toBeGreaterThan(h0 + 20);

  // Alt+Shift+arrows move the focused pane: Files above Source, then out to a column of its own.
  await pane(page, 'Files').getByRole('button', { name: 'History', exact: true }).focus();
  await page.keyboard.press('Alt+Shift+ArrowUp');
  expect((await box('Files')).y).toBeLessThan((await box('Source')).y);
  await page.keyboard.press('Alt+Shift+ArrowRight');
  expect((await box('Files')).x).toBeGreaterThan((await box('Source')).x + 10);

  // Dropping on the left edge docks beside: Preview left of AI.
  await dragTo('Preview', 'AI', 0.05, 0.5);
  const [preview, ai] = [await box('Preview'), await box('AI')];
  expect(preview.x + preview.width).toBeLessThanOrEqual(ai.x + 2);
  expect(Math.abs(preview.y - ai.y)).toBeLessThan(2);
  // The editor kept its text through all the moves.
  await expect(page.locator('.cm-content')).toContainText('"version"');
});

test('clicking a problem jumps to it in the source (URS-WEB-018)', async ({ page }) => {
  await open(page);
  await setSource(page, { version: '1', type: 'flowchart', nodes: [{ id: 'a', to: [{ node: 'b' }] }, { id: 'b', shape: 'star' }] });
  await expect(status(page)).toHaveText('1 error');
  await page.locator('.cm-content').press('ControlOrMeta+Home');
  await page.getByLabel('Diagnostics').getByRole('button').first().click();
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe('"shape"');
});
