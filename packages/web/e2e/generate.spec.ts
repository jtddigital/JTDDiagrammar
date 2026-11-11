import { expect, test, type Page } from '@playwright/test';
import { open, status } from './helpers.ts';

const generated = {
  type: 'flowchart',
  reason: 'steps and actors',
  valid: true,
  attempts: 2,
  diagnostics: [],
  source: { version: '1', type: 'flowchart', title: 'From notes', nodes: [{ id: 'a', label: 'Collect' }, { id: 'b', label: 'Approve' }], edges: [{ from: 'a', to: 'b' }] },
};

async function mockAi(page: Page, enabled: boolean, reply?: { status: number; body: object }) {
  const posts: { contentType: string; body: string }[] = [];
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled } }));
  await page.route('/v1/generate', async (r) => {
    posts.push({ contentType: r.request().headers()['content-type'] ?? '', body: r.request().postDataBuffer()?.toString('utf8') ?? '' });
    await r.fulfill({ status: reply?.status ?? 200, json: reply?.body ?? generated });
  });
  return posts;
}

const panel = (page: Page) => page.getByRole('region', { name: 'Generate with AI' });

test('generates from pasted text and loads the result into the editor (URS-WEB-011)', async ({ page }) => {
  const posts = await mockAi(page, true);
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await panel(page).getByLabel('Material').fill('Clerk collects the form, manager approves it.');
  await panel(page).getByLabel('Diagram type').selectOption('flowchart');
  await panel(page).getByRole('button', { name: 'Generate' }).click();

  await expect(panel(page)).toContainText('Generated a flowchart in 2 attempts. steps and actors.');
  await expect(page.locator('.cm-content')).toContainText('"title": "From notes"');
  await expect(status(page)).toHaveText('Valid');
  expect(posts[0]!.contentType).toMatch(/^multipart\/form-data/);
  expect(posts[0]!.body).toContain('Clerk collects the form');
  expect(posts[0]!.body).toMatch(/name="type"\r\n\r\nflowchart/);
});

test('loads an invalid best attempt and says it needs fixing', async ({ page }) => {
  await mockAi(page, true, { status: 200, body: { ...generated, valid: false, attempts: 3, diagnostics: [{ severity: 'error', code: 'ref.lane', message: 'x', path: '/nodes/0' }] } });
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await panel(page).getByLabel('Material').fill('notes');
  await panel(page).getByRole('button', { name: 'Generate' }).click();
  await expect(panel(page)).toContainText('1 problem left after 3 attempts. Fix them in the editor.');
});

test('shows API errors', async ({ page }) => {
  await mockAi(page, true, { status: 422, body: { diagnostics: [{ severity: 'error', code: 'ai.refusal', message: 'the AI declined to process this material', path: '' }] } });
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await panel(page).getByLabel('Material').fill('notes');
  await panel(page).getByRole('button', { name: 'Generate' }).click();
  await expect(panel(page)).toContainText('the AI declined to process this material');
});

test('says so when the server has no AI configured (URS-API-016)', async ({ page }) => {
  await mockAi(page, false);
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await expect(page.getByText('AI generation is not configured on this server.')).toBeVisible();
});

test('the real server without credentials reports AI as unavailable (URS-API-015)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await expect(page.getByText('AI generation is not configured on this server.')).toBeVisible();
});
