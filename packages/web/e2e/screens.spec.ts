import { test } from '@playwright/test';
import { open } from './helpers.ts';

const conversation = [
  { id: 'u1', role: 'user', text: 'Expense claims: the employee submits a claim with receipts. Their manager checks it against policy and either approves it or returns it for changes. Finance reimburses approved claims within five days.' },
  { id: 'a1', role: 'assistant', tone: 'done', text: 'Created a flowchart diagram. Three actors with an approval decision.', before: '{}' },
  { id: 'u2', role: 'user', text: 'Put each role in its own lane' },
  { id: 'a2', role: 'assistant', tone: 'done', text: 'Updated the flowchart diagram.', before: '{}' },
];

/** README screenshots of the web app (URS-DOC-005). Run with `pnpm docs:screens`. AI calls are mocked: no key or spend. */
test('web app', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5' } }));
  await page.addInitScript((c) => localStorage.setItem('jtd:chat', JSON.stringify(c)), conversation);
  await open(page);
  await page.getByLabel('Example').selectOption({ label: 'Flowchart: Cross-functional flowchart' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../../docs/img/web-app.png' });
});

test('chat', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5' } }));
  await open(page);
  await page.getByRole('group', { name: 'Panes' }).getByRole('button', { name: 'Source' }).click();
  await page.getByRole('button', { name: 'New diagram' }).click();
  await page.getByLabel('Message').fill(conversation[0]!.text);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '../../docs/img/web-generate.png' });
});
