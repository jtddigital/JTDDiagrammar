import { expect, test } from '@playwright/test';
import { createRegistry } from '../../core/src/index.ts';
import { textWidth } from '../../core/src/measure/text.ts';
import { open, preview, setSource, status } from './helpers.ts';

const flow = (label: string, extra: object = {}) => ({
  version: '1',
  type: 'flowchart',
  title: 'E2E',
  nodes: [{ id: 'a', label, to: [{ node: 'b' }] }, { id: 'b' }],
  ...extra,
});

test('renders the first example on load (URS-WEB-001)', async ({ page }) => {
  await open(page);
  await expect(status(page)).toHaveText('Valid');
  await expect(page.getByLabel('Diagnostics').locator('li')).toHaveCount(0);
});

test('live preview follows edits and keeps the last good render on error (URS-WEB-002)', async ({ page }) => {
  await open(page);
  const before = await preview(page).innerHTML();
  await setSource(page, flow('Edited'));
  await expect(preview(page)).toContainText('Edited');
  const good = await preview(page).innerHTML();
  expect(good).not.toBe(before);

  await setSource(page, '{ "version": "1", "type": ');
  await expect(status(page)).toHaveText('1 error');
  await expect(page.getByText('Showing the last valid diagram')).toBeVisible();
  expect(await preview(page).innerHTML()).toBe(good);
  await expect(page.getByRole('button', { name: 'Export SVG' })).toBeDisabled();
});

test('shows diagnostics inline at their source location (URS-WEB-004)', async ({ page }) => {
  await open(page);
  await setSource(page, flow('A', { nodes: [{ id: 'a', shape: 'hexagon' }] }));
  await expect(status(page)).toHaveText('1 error');
  await expect(page.locator('.cm-lintRange-error')).toHaveText('"shape"');
  await expect(page.getByLabel('Diagnostics')).toContainText('/nodes/0/shape');
});

test('exported SVG is byte-identical to the API response (URS-WEB-003)', async ({ page, request }) => {
  await open(page);
  const doc = flow('Export me');
  await setSource(page, doc);
  await expect(preview(page)).toBeVisible();
  await expect(status(page)).toHaveText('Valid');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export SVG' }).click()]);
  expect(download.suggestedFilename()).toBe('e2e.svg');
  const exported = await (await download.createReadStream()).toArray();
  const api = await request.post('/v1/render', { data: doc });
  expect(Buffer.concat(exported).toString('utf8')).toBe(await api.text());
});

test('loads every registered example without errors (URS-WEB-007, URS-WEB-010)', async ({ page }) => {
  await open(page);
  const count = createRegistry().types().reduce((n, t) => n + t.examples.length, 0);
  for (let i = 0; i < count; i++) {
    await page.getByLabel('Example').selectOption(String(i));
    await expect(status(page)).toHaveText('Valid');
  }
});

test('browser text widths match the bundled metrics (URS-LY-009)', async ({ page }) => {
  await open(page);
  const samples = ['Request reset link', 'Order fulfilment', 'WWW iii 0123 ÄÖÜ é', 'Customer Success'];
  const measured = await page.evaluate((ss) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.append(svg);
    return ss.map((s) =>
      [false, true].map((bold) => {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('font-family', "Arial, 'Liberation Sans', Helvetica, sans-serif");
        t.setAttribute('font-size', '14');
        if (bold) t.setAttribute('font-weight', 'bold');
        t.setAttribute('style', 'font-kerning:none;font-variant-ligatures:none');
        t.textContent = s;
        svg.append(t);
        return t.getComputedTextLength();
      }),
    );
  }, samples);
  samples.forEach((s, i) => {
    expect(measured[i]![0]).toBeCloseTo(textWidth(s, { size: 14 }), 1);
    expect(measured[i]![1]).toBeCloseTo(textWidth(s, { size: 14, bold: true }), 1);
  });
});

test('never offers a stale render for export while an edit is pending (URS-WEB-003)', async ({ page }) => {
  await open(page);
  await setSource(page, flow('Pending'));
  await expect(status(page)).toHaveText('Updating…');
  await expect(page.getByRole('button', { name: 'Export SVG' })).toBeDisabled();
  await expect(status(page)).toHaveText('Valid');
  await expect(page.getByRole('button', { name: 'Export SVG' })).toBeEnabled();
});

test('edits, validates and exports a second diagram type with the same UI (URS-WEB-010)', async ({ page, request }) => {
  await open(page);
  const doc = { version: '1', type: 'state', title: 'Door', states: [{ id: 'i', kind: 'initial', to: [{ state: 'closed' }] }, { id: 'closed', to: [{ state: 'open', event: 'push' }] }, { id: 'open' }] };
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  await setSource(page, { ...doc, states: [...doc.states, { id: 'x', kind: 'final', states: [{ id: 'y' }] }] });
  await expect(status(page)).toHaveText('1 error');
  await expect(page.locator('.cm-lintRange-error')).toHaveText('"states"');
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export SVG' }).click()]);
  const exported = Buffer.concat(await (await download.createReadStream()).toArray()).toString('utf8');
  expect(exported).toBe(await (await request.post('/v1/render', { data: doc })).text());
  expect(exported).toContain('class="jtd jtd-state"');
});
