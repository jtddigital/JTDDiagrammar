import { test } from '@playwright/test';
import { open, setSource } from './helpers.ts';

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
  await page.getByRole('group', { name: 'Panes' }).getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('button', { name: 'New diagram' }).click();
  await page.getByLabel('Message').fill(conversation[0]!.text);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '../../docs/img/web-generate.png' });
});

test('compare', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5' } }));
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles([
    { name: 'plan-v1.md', mimeType: 'text/markdown', buffer: Buffer.from('# Launch plan\n\nShip the beta to the pilot group in May.\n\n- [x] Draft the release notes\n- [ ] Review with support\n\n| Step | Days |\n|:--|--:|\n| Build | 5 |\n| Test | 3 |\n\nWe will decide on pricing later.\n') },
    { name: 'plan-v2.md', mimeType: 'text/markdown', buffer: Buffer.from('# Launch plan\n\nShip the beta to every customer in June.\n\n- [x] Draft the release notes\n- [x] Review with support\n- [ ] Train the sales team\n\n| Step | Days |\n|:--|--:|\n| Build | 5 |\n| Test | 4 |\n') },
  ]);
  const panes = page.getByRole('group', { name: 'Panes' });
  for (const p of ['AI', 'Preview']) await panes.getByRole('button', { name: p, exact: true }).click();
  const tree = page.getByRole('tree', { name: 'Files' });
  await tree.getByRole('treeitem', { name: 'plan-v1.md' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Compare with…' }).click();
  await tree.getByRole('treeitem', { name: 'plan-v2.md' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '../../docs/img/web-compare.png' });
});

test('compare diagrams', async ({ page }) => {
  await page.route('/v1/ai', (r) => r.fulfill({ json: { enabled: true, model: 'claude-opus-5-5' } }));
  await open(page);
  const lanes = [{ id: 'emp', label: 'Employee' }, { id: 'mgr', label: 'Manager' }, { id: 'fin', label: 'Finance' }];
  const before = {
    version: '1',
    type: 'flowchart',
    title: 'Expense claims',
    lanes,
    nodes: [
      { id: 'submit', label: 'Submit claim', lane: 'emp', to: [{ node: 'review' }] },
      { id: 'review', label: 'Review claim', lane: 'mgr', to: [{ node: 'ok' }] },
      { id: 'ok', shape: 'decision', label: 'Within policy?', lane: 'mgr', to: [{ node: 'pay', label: 'yes' }, { node: 'submit', label: 'no' }] },
      { id: 'pay', label: 'Reimburse', lane: 'fin' },
    ],
  };
  const after = {
    ...before,
    nodes: [
      { id: 'submit', label: 'Submit claim', lane: 'emp', to: [{ node: 'review' }] },
      { id: 'review', label: 'Check receipts', lane: 'mgr', to: [{ node: 'ok' }] },
      { id: 'ok', shape: 'decision', label: 'Within policy?', lane: 'mgr', to: [{ node: 'audit', label: 'yes' }, { node: 'submit', label: 'no' }] },
      { id: 'audit', label: 'Audit sample', lane: 'fin', to: [{ node: 'pay' }] },
      { id: 'pay', label: 'Reimburse', lane: 'fin' },
    ],
  };
  await setSource(page, before);
  await page.keyboard.press('ControlOrMeta+s');
  await setSource(page, after);
  const panes = page.getByRole('group', { name: 'Panes' });
  for (const p of ['AI', 'Source', 'Preview']) await panes.getByRole('button', { name: p, exact: true }).click();
  await page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name: 'Untitled.json' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Compare with saved' }).click();
  await page.getByRole('list', { name: 'Changes' }).getByRole('button', { name: /Check receipts/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '../../docs/img/web-compare-diagram.png' });
});
