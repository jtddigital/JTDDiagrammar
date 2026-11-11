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

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

test('shows staged progress from the event stream (URS-WEB-012)', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true } }));
  // route.fulfill delivers the whole body at once; a paced stream is needed to see each stage.
  await page.addInitScript((body: string[]) => {
    const real = window.fetch;
    window.fetch = (input, init) => {
      if (String(input) !== '/v1/generate') return real(input, init);
      (window as unknown as { accept: string }).accept = new Headers(init?.headers).get('accept') ?? '';
      const stream = new ReadableStream({
        async start(c) {
          for (const chunk of body) {
            c.enqueue(new TextEncoder().encode(chunk));
            await new Promise((r) => setTimeout(r, 100));
          }
          c.close();
        },
      });
      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    };
    // Record every status line; polling assertions can miss a short-lived one.
    const notes: string[] = ((window as unknown as { notes: string[] }).notes = []);
    new MutationObserver(() => {
      const t = document.querySelector('.generate .note')?.textContent;
      if (t && t !== notes.at(-1)) notes.push(t);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, [sse([['progress', { stage: 'ingest' }]]), sse([['progress', { stage: 'repair', attempt: 2 }]]), sse([['result', generated]])]);
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await panel(page).getByLabel('Material').fill('notes');
  await panel(page).getByRole('button', { name: 'Generate' }).click();
  await expect(panel(page)).toContainText('Generated a flowchart in 2 attempts.');
  expect(await page.evaluate(() => (window as unknown as { notes: string[] }).notes)).toEqual([
    'Starting… this can take a minute.',
    'Reading documents…',
    'Fixing problems… (attempt 2)',
    'Generated a flowchart in 2 attempts. steps and actors.',
  ]);
  expect(await page.evaluate(() => (window as unknown as { accept: string }).accept)).toContain('text/event-stream');
});

test('refines the current diagram from an instruction (URS-WEB-013)', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true } }));
  let body: { source?: { title?: string }; instruction?: string } = {};
  await page.route('/v1/refine', (r) => {
    body = r.request().postDataJSON() as typeof body;
    return r.fulfill({ json: { ...generated, attempts: 1, source: { ...generated.source, title: 'Refined' } } });
  });
  await open(page);
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  const refine = panel(page).getByRole('button', { name: 'Refine' });
  await expect(refine).toBeDisabled();
  await panel(page).getByLabel('Instruction').fill('rename it');
  await refine.click();
  await expect(panel(page)).toContainText('Refined a flowchart in 1 attempt.');
  await expect(page.locator('.cm-content')).toContainText('"title": "Refined"');
  expect(body.instruction).toBe('rename it');
  expect(body.source?.title).toBeDefined();
});
