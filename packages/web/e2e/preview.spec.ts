import { expect, test } from '@playwright/test';
import { inflateRawSync } from 'node:zlib';
import { open, preview, setSource, status } from './helpers.ts';

const doc = {
  version: '1',
  type: 'flowchart',
  title: 'Preview',
  nodes: [
    { id: 'a', label: 'Start here', to: [{ node: 'b', label: 'next' }] },
    { id: 'b', label: 'Quoted', quote: 'the clerk files it' },
  ],
};

const scale = async (page: import('@playwright/test').Page) =>
  preview(page).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

test('pans and zooms the preview (URS-WEB-006)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const s0 = await scale(page);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect(await scale(page)).toBeCloseTo(s0 * 1.25);
  await page.getByRole('button', { name: '1:1' }).click();
  expect(await scale(page)).toBe(1);

  const box = (await page.getByLabel('Preview').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => scale(page)).toBeCloseTo(1.1);

  const before = await preview(page).boundingBox();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  const after = await preview(page).boundingBox();
  expect(after!.x - before!.x).toBeCloseTo(60, 0);
  expect(after!.y - before!.y).toBeCloseTo(30, 0);
});

test('renders sanitised inline SVG with provenance tooltips (URS-WEB-014)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(preview(page).locator('svg #n-b > title')).toHaveText('the clerk files it');
  await expect(preview(page).locator('script, foreignObject')).toHaveCount(0);
});

test('clicking a node or edge selects its source (URS-WEB-009)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const selected = () => page.evaluate(() => getSelection()?.toString() ?? '');
  await preview(page).locator('#n-b').click();
  await expect.poll(selected).toBe('{');
  await expect(page.locator('.cm-selectionBackground').first()).toBeVisible();
  await preview(page).getByText('next').click();
  await expect(page.locator('.cm-activeLine')).toContainText('{');
});

test('autocompletes schema properties and values (URS-WEB-005)', async ({ page }) => {
  await open(page);
  await setSource(page, '{ "version": "1", "type": "flowchart", "direction": ');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete li')).toHaveText(['"LR"', '"TB"']);
  // CodeMirror ignores Enter for its interactionDelay (75 ms) after the list opens.
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(', "nodes": [] }');
  await expect(status(page)).toHaveText('Valid');
  await expect(page.locator('.cm-content')).toContainText('"direction": "LR"');
});

test('restores the last session and opens share links (URS-WEB-008)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  await page.reload();
  await expect(preview(page)).toContainText('Start here');

  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const url = page.url();
  expect(inflateRawSync(Buffer.from(url.split('#src=')[1]!, 'base64url')).toString()).toContain('"Start here"');

  const other = await context.newPage();
  await other.evaluate(() => localStorage.clear()).catch(() => {});
  await other.goto(url);
  await expect(preview(other)).toContainText('Quoted');
});

test('exports a 2x PNG (URS-RN-007)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export PNG' }).click()]);
  expect(download.suggestedFilename()).toBe('preview.png');
  const png = Buffer.concat(await (await download.createReadStream()).toArray());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const svg = (await preview(page).locator('svg').evaluate((el) => [Number(el.getAttribute('width')), Number(el.getAttribute('height'))])) as [number, number];
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(svg.map((v) => Math.ceil(v * 2)));
});

test('fits each new diagram until the user zooms (URS-WEB-006)', async ({ page }) => {
  await open(page);
  const pane = page.getByLabel('Preview');
  const inside = async () => {
    const [p, s] = [(await pane.boundingBox())!, (await preview(page).locator('svg').boundingBox())!];
    return s.x >= p.x && s.y >= p.y && s.x + s.width <= p.x + p.width + 0.5 && s.y + s.height <= p.y + p.height + 0.5;
  };
  for (let i = 0; i < 3; i++) {
    await page.getByLabel('Example').selectOption(String(i));
    await expect.poll(inside).toBe(true);
  }
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await expect.poll(inside).toBe(true);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByLabel('Example').selectOption('0');
  await expect.poll(inside).toBe(false);
  await page.getByRole('button', { name: 'Fit' }).click();
  await expect.poll(inside).toBe(true);
});
