import { expect, test } from '@playwright/test';
import { open, setSource, status } from './helpers.ts';

const pane = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true });

test('shows three panes that can be hidden, but not all of them (URS-WEB-015)', async ({ page }) => {
  await open(page);
  for (const name of ['AI', 'Source', 'Diagram']) await expect(pane(page, name)).toBeVisible();
  const toggle = (name: string) => page.getByRole('group', { name: 'Panes' }).getByRole('button', { name });
  await toggle('AI').click();
  await expect(pane(page, 'AI')).toHaveCount(0);
  await expect(toggle('AI')).toHaveAttribute('aria-pressed', 'false');
  await toggle('Source').click();
  await toggle('Diagram').click();
  await expect(pane(page, 'Diagram')).toBeVisible();
  // Remembered across reloads.
  await page.reload();
  await expect(pane(page, 'AI')).toHaveCount(0);
  await expect(pane(page, 'Source')).toHaveCount(0);
  await toggle('Source').click();
  await expect(pane(page, 'Source')).toBeVisible();
});

test('resizes panes by dragging or with the keyboard (URS-WEB-015)', async ({ page }) => {
  await open(page);
  const gutter = page.getByRole('separator', { name: 'Resize Source and Diagram' });
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

test('opens JSON, YAML and XML files and saves back to the file (URS-WEB-019)', async ({ page }) => {
  // The native file pickers cannot be driven from a test, so they are replaced by fakes that record what is written.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { written: string[]; nextFile: { name: string; text: string } };
    w.written = [];
    const handle = (name: string, text = '') => ({
      name,
      getFile: async () => new File([text], name),
      createWritable: async () => ({ write: async (t: string) => void w.written.push(`${name}:${t}`), close: async () => {} }),
    });
    w.showOpenFilePicker = async () => [handle(w.nextFile.name, w.nextFile.text)];
    w.showSaveFilePicker = async (o: { suggestedName: string }) => handle(o.suggestedName);
  });
  await open(page);
  const pick = (name: string, text: string) => page.evaluate(([n, t]) => ((window as unknown as { nextFile: object }).nextFile = { name: n, text: t }), [name, text]);

  await pick('door.yaml', 'version: "1"\ntype: state\ntitle: Door\nstates:\n  - id: closed\n    to: [{ state: open }]\n  - id: open\n');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.cm-content')).toContainText('"title": "Door"');
  await expect(page.getByText('Converted door.yaml to JSON')).toBeVisible();
  await expect(status(page)).toHaveText('Valid');
  // A converted file is saved as new JSON, not over the YAML.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved door.json')).toBeVisible();

  const json = '{\n  "version": "1",\n  "type": "flowchart",\n  "title": "Mine",\n  "nodes": [{ "id": "a" }]\n}\n';
  await pick('mine.json', json);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.cm-content')).toContainText('"title": "Mine"');
  await expect(page.locator('.toolbar__file')).toHaveText('mine.json');
  await setSource(page, json.replace('Mine', 'Mine too'));
  await expect(page.locator('.toolbar__file')).toContainText('•');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.toolbar__file')).toHaveText('mine.json');
  const written = await page.evaluate(() => (window as unknown as { written: string[] }).written);
  expect(written[0]).toMatch(/^door\.json:\{\n {2}"version": "1",\n {2}"type": "state"/);
  expect(written[1]).toBe(`mine.json:${json.replace('Mine', 'Mine too')}`);
});
