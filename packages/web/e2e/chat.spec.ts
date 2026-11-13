import { expect, test, type Page } from '@playwright/test';
import { open, status } from './helpers.ts';

const generated = {
  type: 'flowchart',
  reason: 'steps and actors',
  valid: true,
  attempts: 2,
  diagnostics: [],
  source: { version: '1', type: 'flowchart', title: 'From notes', nodes: [{ id: 'a', label: 'Collect', to: [{ node: 'b' }] }, { id: 'b', label: 'Approve' }] },
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

const chat = (page: Page) => page.getByRole('region', { name: 'AI' });
const log = (page: Page) => page.getByRole('log', { name: 'Conversation' });

async function ask(page: Page, text: string, mode?: 'New diagram') {
  if (mode) await chat(page).getByRole('button', { name: mode }).click();
  await chat(page).getByLabel('Message').fill(text);
  await chat(page).getByRole('button', { name: 'Send' }).click();
}

test('creates a diagram from pasted text and loads it into the editor (URS-WEB-011, URS-WEB-016)', async ({ page }) => {
  const posts = await mockAi(page, true);
  await open(page);
  await chat(page).getByRole('button', { name: 'New diagram' }).click();
  await chat(page).getByLabel('Diagram type').selectOption('flowchart');
  await ask(page, 'Clerk collects the form, manager approves it.');

  await expect(log(page)).toContainText('Clerk collects the form, manager approves it.');
  await expect(log(page)).toContainText('Created a flowchart diagram (2 attempts). Steps and actors.');
  await expect(page.locator('.cm-content')).toContainText('"title": "From notes"');
  await expect(status(page)).toHaveText('Valid');
  expect(posts[0]!.contentType).toMatch(/^multipart\/form-data/);
  expect(posts[0]!.body).toContain('Clerk collects the form');
  expect(posts[0]!.body).toMatch(/name="type"\r\n\r\nflowchart/);
  // After creating, the next message edits what was created.
  await expect(chat(page).getByRole('button', { name: 'Edit diagram' })).toHaveAttribute('aria-pressed', 'true');
});

test('sends on Enter, keeps Shift+Enter for new lines', async ({ page }) => {
  const posts = await mockAi(page, true);
  await open(page);
  await chat(page).getByRole('button', { name: 'New diagram' }).click();
  const box = chat(page).getByLabel('Message');
  await box.fill('line one');
  await box.press('Shift+Enter');
  await box.pressSequentially('line two');
  await box.press('Enter');
  await expect(log(page)).toContainText('Created a flowchart diagram');
  // Form data sends newlines as CRLF.
  expect(posts[0]!.body).toMatch(/line one\r?\nline two/);
});

test('says when the best attempt still has problems', async ({ page }) => {
  await mockAi(page, true, { status: 200, body: { ...generated, valid: false, attempts: 3, diagnostics: [{ severity: 'error', code: 'ref.lane', message: 'x', path: '/nodes/0' }] } });
  await open(page);
  await ask(page, 'notes', 'New diagram');
  await expect(log(page)).toContainText('1 problem remained after 3 attempts');
});

test('shows API errors in the conversation', async ({ page }) => {
  await mockAi(page, true, { status: 422, body: { diagnostics: [{ severity: 'error', code: 'ai.refusal', message: 'the AI declined to process this material', path: '' }] } });
  await open(page);
  await ask(page, 'notes', 'New diagram');
  await expect(log(page).locator('.msg[data-tone="error"]')).toContainText('the AI declined to process this material');
});

test('says so when the server has no AI configured (URS-API-016)', async ({ page }) => {
  await mockAi(page, false);
  await open(page);
  await expect(chat(page).getByText('AI generation is not configured on this server.')).toBeVisible();
});

test('the real server without credentials reports AI as unavailable (URS-API-015)', async ({ page }) => {
  await open(page);
  await expect(chat(page).getByText('AI generation is not configured on this server.')).toBeVisible();
});

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

test('shows staged progress from the event stream, and can stop (URS-WEB-012)', async ({ page }) => {
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
            await new Promise((r) => setTimeout(r, 150));
          }
          c.close();
        },
      });
      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    };
    // Record every status line; polling assertions can miss a short-lived one.
    const notes: string[] = ((window as unknown as { notes: string[] }).notes = []);
    new MutationObserver(() => {
      const t = [...document.querySelectorAll('.msg--assistant .msg__text')].at(-1)?.textContent;
      if (t && t !== notes.at(-1)) notes.push(t);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, [sse([['progress', { stage: 'ingest' }]]), sse([['progress', { stage: 'repair', attempt: 2 }]]), sse([['result', generated]])]);
  await open(page);
  await ask(page, 'notes', 'New diagram');
  await expect(chat(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(log(page)).toContainText('Created a flowchart diagram (2 attempts).');
  expect(await page.evaluate(() => (window as unknown as { notes: string[] }).notes)).toEqual([
    'Starting…',
    'Reading documents…',
    'Fixing problems… (attempt 2)',
    'Created a flowchart diagram (2 attempts). Steps and actors.',
  ]);
  expect(await page.evaluate(() => (window as unknown as { accept: string }).accept)).toContain('text/event-stream');
});

test('edits the current diagram from a message, then steps back and forward (URS-WEB-013, URS-WEB-017)', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true } }));
  let body: { source?: { title?: string }; instruction?: string } = {};
  await page.route('/v1/refine', (r) => {
    body = r.request().postDataJSON() as typeof body;
    return r.fulfill({ json: { ...generated, attempts: 1, source: { ...generated.source, title: 'Refined' } } });
  });
  await open(page);
  await expect(chat(page).getByRole('button', { name: 'Edit diagram' })).toHaveAttribute('aria-pressed', 'true');
  await ask(page, 'rename it');
  await expect(log(page)).toContainText('Updated the flowchart diagram.');
  await expect(page.locator('.cm-content')).toContainText('"title": "Refined"');
  expect(body.instruction).toBe('rename it');
  expect(body.source?.title).toBe('Password reset');

  await log(page).getByRole('button', { name: 'Step back' }).click();
  await expect(log(page)).toContainText('Stepped back to the diagram before that change.');
  await expect(page.locator('.cm-content')).toContainText('"title": "Password reset"');
  // Stepping back is a change too.
  await log(page).getByRole('button', { name: 'Step back' }).last().click();
  await expect(page.locator('.cm-content')).toContainText('"title": "Refined"');
});

test('keeps the conversation across reloads and starts a new chat on request', async ({ page }) => {
  await mockAi(page, true);
  await open(page);
  await ask(page, 'remember me', 'New diagram');
  await expect(log(page)).toContainText('Created a flowchart diagram');
  await page.reload();
  await expect(log(page)).toContainText('remember me');
  await chat(page).getByRole('button', { name: 'New chat' }).click();
  await expect(log(page)).not.toContainText('remember me');
});

test('offers each configured AI, sends the choice, and remembers it (URS-AI-023)', async ({ page }) => {
  await page.route('/v1/ai', (r) =>
    r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5', providers: [{ id: 'claude', model: 'claude-opus-5-5' }, { id: 'copilot', clientId: 'app', tenantId: 'organizations', scopes: ['https://graph.microsoft.com/Mail.Read'] }] } }),
  );
  let body: { provider?: string } = {};
  await page.route('/v1/refine', (r) => {
    body = r.request().postDataJSON() as typeof body;
    return r.fulfill({ json: { ...generated, attempts: 1 } });
  });
  await open(page);
  const pick = chat(page).getByLabel('AI', { exact: true });
  await expect(pick.locator('option')).toHaveText(['Claude', 'Microsoft 365 Copilot']);
  await ask(page, 'rename it');
  await expect(log(page)).toContainText('Updated the flowchart diagram.');
  expect(body.provider).toBe('claude');

  await pick.selectOption('copilot');
  await expect(chat(page).getByRole('button', { name: 'Sign in with Microsoft' })).toBeVisible();
  await page.reload();
  await expect(chat(page).getByLabel('AI', { exact: true })).toHaveValue('copilot');
});

test('shows an AI the server is not set up for, disabled, with how to set it up (URS-AI-023)', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5', providers: [{ id: 'claude', model: 'claude-opus-5-5' }] } }));
  await open(page);
  const pick = chat(page).getByLabel('AI', { exact: true });
  await expect(pick.locator('option')).toHaveText(['Claude', 'Microsoft 365 Copilot (not set up)']);
  await expect(pick.locator('option[value="copilot"]')).toBeDisabled();
  await expect(pick).toHaveAttribute('title', /COPILOT_CLIENT_ID.*config\.env, then restart/);
});

test('signs in to Microsoft with a device code, then sends the token with Copilot requests (URS-AI-024)', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, providers: [{ id: 'copilot', clientId: 'app', tenantId: 'contoso.com', scopes: [], signIn: 'device' }] } }));
  await page.route('/v1/auth/microsoft/device', (r) => r.fulfill({ json: { userCode: 'ABCD-EFGH', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc', interval: 1, expiresIn: 900 } }));
  let polls = 0;
  await page.route('/v1/auth/microsoft/token', (r) => r.fulfill({ json: ++polls < 2 ? { pending: true } : { accessToken: 'graph-token', refreshToken: 'rt', expiresIn: 3600, account: 'Matt M' } }));
  let sent: { token?: string; provider?: string } = {};
  await page.route('/v1/refine', (r) => {
    sent = { token: r.request().headers()['x-graph-token'], provider: (r.request().postDataJSON() as { provider: string }).provider };
    return r.fulfill({ json: { ...generated, attempts: 1 } });
  });
  await open(page);
  await chat(page).getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await expect(log(page).locator('.msg__code')).toHaveText('ABCD-EFGH');
  await expect(log(page).getByRole('link', { name: 'Open Microsoft sign-in' })).toHaveAttribute('href', 'https://microsoft.com/devicelogin');
  await expect(log(page)).toContainText('Signed in to Microsoft as Matt M.');
  await expect(log(page).locator('.msg__code')).toHaveCount(0);
  await expect(chat(page).getByRole('button', { name: 'Matt' })).toBeVisible();

  await ask(page, 'rename it');
  await expect(log(page)).toContainText('Updated the flowchart diagram.');
  expect(sent).toEqual({ token: 'graph-token', provider: 'copilot' });
});
