import { expect, test, type Page } from '@playwright/test';
import { open, setSource } from './helpers.ts';

const item = (page: Page, name: string) => page.getByRole('tree', { name: 'Files' }).getByRole('treeitem', { name, exact: true });
const command = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
const compare = (page: Page) => page.getByRole('region', { name: 'Compare', exact: true });

async function importFiles(page: Page, files: Record<string, string>) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles(Object.entries(files).map(([name, text]) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })));
}

async function compareFiles(page: Page, first: string, second: string) {
  await item(page, first).click({ button: 'right' });
  await command(page, 'Compare with…').click();
  await expect(page.getByText(`Choose a file to compare with ${first}`)).toBeVisible();
  await item(page, second).click();
}

test('compares unsaved edits with the saved text: side by side, unified, folded, next change, and closes (URS-WS-030..032)', async ({ page }) => {
  await open(page);
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
  await importFiles(page, { 'notes.txt': `${lines.join('\n')}\n` });
  await item(page, 'notes.txt').click();
  await expect(compare(page)).toHaveCount(0);
  const edited = [...lines];
  edited[4] = 'line five, reworded';
  edited.splice(30, 1);
  await setSource(page, `${edited.join('\n')}\n`);

  await item(page, 'notes.txt').click({ button: 'right' });
  await command(page, 'Compare with saved').click();
  const pane = compare(page);
  await expect(pane).toBeVisible();
  await expect(pane.getByLabel('Before version')).toHaveValue('1');
  await expect(pane.getByLabel('After version')).toHaveValue('');
  const table = pane.getByRole('table', { name: 'Text comparison' });
  // The changed line pairs up, with only the changed words marked.
  const changed = table.locator('tr[data-kind="change"]');
  await expect(changed.locator('del')).toHaveText('5');
  await expect(changed.locator('ins')).toHaveText('five, reworded');
  await expect(table.locator('tr[data-kind="del"]')).toContainText('line 31');
  await expect(pane.getByText('+1')).toBeVisible();
  await expect(pane.getByText('−2')).toBeVisible();
  // The unchanged middle is folded and can be shown.
  const fold = pane.getByRole('button', { name: 'Show 19 unchanged lines' });
  await expect(fold).toBeVisible();
  await expect(table).not.toContainText('line 20');
  await fold.click();
  await expect(table).toContainText('line 20');

  await pane.getByRole('button', { name: 'Next change' }).click();
  await expect(pane.getByText('Change 1 of 2')).toBeVisible();
  await pane.getByRole('button', { name: 'Next change' }).click();
  await expect(table.locator('tr[data-active]')).toContainText('line 31');
  await pane.getByRole('button', { name: 'Previous change' }).click();
  await expect(pane.getByText('Change 1 of 2')).toBeVisible();

  await pane.getByRole('button', { name: 'Unified' }).click();
  const unified = pane.getByRole('table', { name: 'Text comparison' });
  await expect(unified.locator('tr[data-kind="del"]').first()).toContainText('line 5');
  await expect(unified.locator('tr[data-kind="ins"]')).toContainText('line five, reworded');

  // The comparison follows the edits as they are typed.
  await setSource(page, `${lines.join('\n')}\n`);
  await expect(pane.getByText('No differences')).toBeVisible();

  await pane.getByRole('button', { name: 'Close comparison' }).click();
  await expect(compare(page)).toHaveCount(0);
});

test('compares two Markdown files rendered, with blocks marked, and as text (URS-WS-033)', async ({ page }) => {
  await open(page);
  await importFiles(page, {
    'old.md': '# Plan\n\nKeep this.\n\n- [ ] draft\n- review\n\nGone soon.\n',
    'new.md': '# Plan\n\nKeep this.\n\n- [x] draft\n- review\n- ship\n',
  });
  await compareFiles(page, 'old.md', 'new.md');
  const pane = compare(page);
  await expect(pane.getByRole('button', { name: 'Rendered' })).toHaveAttribute('aria-pressed', 'true');
  const before = pane.getByRole('region', { name: 'Before' });
  const after = pane.getByRole('region', { name: 'After' });
  await expect(before.locator('[data-diff="removed"]')).toHaveText('Gone soon.');
  await expect(before.locator('[data-diff="changed"]')).toContainText('draft');
  await expect(after.locator('[data-diff="added"]')).toHaveText('ship');
  await expect(after.getByRole('heading', { name: 'Plan' })).not.toHaveAttribute('data-diff');
  await expect(pane.getByText('1 added')).toBeVisible();

  await pane.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(pane.getByRole('table', { name: 'Text comparison' })).toContainText('Gone soon.');
  // Swapping the sides swaps what is added and removed.
  await pane.getByRole('button', { name: 'Swap sides' }).click();
  await pane.getByRole('button', { name: 'Rendered' }).click();
  await expect(pane.getByRole('region', { name: 'Before' }).locator('[data-diff="removed"]')).toHaveText('ship');
});

test('compares CSV as a table, by position or by a key column (URS-WS-034)', async ({ page }) => {
  await open(page);
  await importFiles(page, {
    'stock-old.csv': 'id,name,qty\n1,Bolt,10\n2,Nut,5\n3,Gear,1\n',
    'stock-new.csv': 'id,name,qty\n1,Bolt,12\n3,Gear,1\n4,Cog,7\n',
  });
  await compareFiles(page, 'stock-old.csv', 'stock-new.csv');
  const pane = compare(page);
  const grid = pane.getByRole('table', { name: 'Table comparison' });
  await pane.getByLabel('Match rows').selectOption('id');
  await expect(grid.locator('tbody tr')).toHaveCount(3);
  const changed = grid.locator('tr[data-kind="changed"]');
  await expect(changed.locator('del')).toHaveText('10');
  await expect(changed.locator('ins')).toHaveText('12');
  await expect(grid.locator('tr[data-kind="removed"]')).toContainText('Nut');
  await expect(grid.locator('tr[data-kind="added"]')).toContainText('Cog');
  await pane.getByLabel('Unchanged rows').check();
  await expect(grid.locator('tbody tr')).toHaveCount(4);
});

test('compares any two versions of a file from its history (URS-WS-021, WS-032)', async ({ page }) => {
  await open(page);
  for (const title of ['One', 'Two']) {
    await setSource(page, { version: '1', type: 'flowchart', title, nodes: [{ id: 'a' }] });
    await page.keyboard.press('ControlOrMeta+s');
    await expect(item(page, 'Untitled.json')).not.toContainText('•');
  }
  await item(page, 'Untitled.json').click({ button: 'right' });
  await command(page, 'History').click();
  const history = page.getByRole('region', { name: 'History of Untitled.json' });
  // Version 2 (One) against the current text (Two).
  await history.locator('.files__versions li').nth(1).getByRole('button', { name: 'Compare' }).click();
  const pane = compare(page);
  // Two diagrams open drawn; the text is a tab away.
  await expect(pane.getByRole('list', { name: 'Changes' })).toContainText('title “One” → “Two”');
  await pane.getByRole('button', { name: 'Text', exact: true }).click();
  const table = pane.getByRole('table', { name: 'Text comparison' });
  await expect(table.locator('tr[data-kind="change"] del')).toHaveText('One');
  await expect(table.locator('tr[data-kind="change"] ins')).toHaveText('Two');
  // Then two saved versions: 1 (the first run's file) and 2.
  await pane.getByLabel('After version').selectOption('2');
  await pane.getByLabel('Before version').selectOption('1');
  await expect(table.locator('tr[data-kind="change"] ins').first()).toHaveText('One');
});

test('compares two versions of a diagram: both drawn, changes marked and listed, pan and zoom together (URS-WS-035)', async ({ page }) => {
  await open(page);
  const doc = {
    version: '1',
    type: 'flowchart',
    nodes: [
      { id: 'a', label: 'Submit', to: [{ node: 'b' }, { node: 'c' }] },
      { id: 'b', label: 'Check' },
      { id: 'c', label: 'Pay' },
    ],
  };
  await setSource(page, doc);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(item(page, 'Untitled.json')).not.toContainText('•');
  await setSource(page, { ...doc, nodes: [{ id: 'a', label: 'Submit', to: [{ node: 'c' }, { node: 'd' }] }, { id: 'c', label: 'Pay now' }, { id: 'd', label: 'File' }] });
  await item(page, 'Untitled.json').click({ button: 'right' });
  await command(page, 'Compare with saved').click();
  const pane = compare(page);
  await expect(pane.getByRole('button', { name: 'Diagram', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const before = pane.getByRole('region', { name: 'Before' });
  const after = pane.getByRole('region', { name: 'After' });
  await expect(before.locator('[id="n-b"]')).toHaveAttribute('data-diff', 'removed');
  await expect(before.locator('[id="n-c"]')).toHaveAttribute('data-diff', 'changed');
  await expect(after.locator('[id="n-c"]')).toHaveAttribute('data-diff', 'changed');
  await expect(after.locator('[id="n-d"]')).toHaveAttribute('data-diff', 'added');
  await expect(after.locator('[id="n-a"]')).not.toHaveAttribute('data-diff');

  const changes = pane.getByRole('list', { name: 'Changes' });
  await expect(changes.getByRole('button')).toHaveText([/removed.*Node “Check” removed/, /changed.*Node “Pay now”: label “Pay” → “Pay now”.*line \d+/, /added.*Node “File” added/, /removed.*Link “Submit” → “Check” removed.*was line \d+/, /added.*Link “Submit” → “File” added/]);
  // Choosing a change outlines it in both drawings.
  await changes.getByRole('button', { name: /Pay now/ }).click();
  await expect(before.locator('[id="n-c"]')).toHaveClass(/is-selected/);
  await expect(after.locator('[id="n-c"]')).toHaveClass(/is-selected/);

  // Zooming one drawing zooms the other.
  const stage = (r: typeof before) => r.getByTestId('preview');
  await before.getByRole('button', { name: 'Zoom in' }).click();
  await expect(stage(after)).toHaveAttribute('style', (await stage(before).getAttribute('style'))!);

  // The text comparison is a tab away.
  await pane.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(pane.getByRole('table', { name: 'Text comparison' })).toContainText('Pay now');
});
