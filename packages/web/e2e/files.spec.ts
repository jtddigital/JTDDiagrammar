import { expect, test, type Page } from '@playwright/test';
import { open, setSource, status } from './helpers.ts';

const tree = (page: Page) => page.getByRole('tree', { name: 'Files' });
const item = (page: Page, name: string) => tree(page).getByRole('treeitem', { name, exact: true });
const menu = (page: Page) => page.getByRole('menu').first();
const command = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
const pane = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/** Rename the item being renamed. */
async function typeName(page: Page, name: string) {
  const box = page.getByRole('textbox', { name: 'New name' });
  await box.fill(name);
  await box.press('Enter');
}

test('starts with the last session as a file, and keeps files across reloads (URS-WS-001, WS-006)', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('jtd:source', JSON.stringify({ version: '1', type: 'flowchart', title: 'From last time', nodes: [{ id: 'a' }] }, null, 2));
      sessionStorage.setItem('seeded', '1');
    }
  });
  await open(page);
  await expect(item(page, 'Untitled.json')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.cm-content')).toContainText('From last time');
  await page.reload();
  await expect(item(page, 'Untitled.json')).toBeVisible();
  await expect(page.locator('.cm-content')).toContainText('From last time');
});

test('creates folders and files from the context menu, renames them, and opens each by kind (URS-WS-002, WS-004, WS-011)', async ({ page }) => {
  await open(page);
  await page.locator('.files__body').click({ button: 'right', position: { x: 20, y: 300 } });
  await command(page, 'New folder').click();
  await typeName(page, 'Notes');
  await expect(item(page, 'Notes')).toBeVisible();

  await item(page, 'Notes').click({ button: 'right' });
  await command(page, 'New Markdown file').click();
  await typeName(page, 'Plan.md');
  await expect(item(page, 'Plan.md')).toHaveAttribute('aria-level', '2');
  await item(page, 'Plan.md').click();
  await expect(page.locator('.toolbar__file')).toHaveText('Notes/Plan.md');
  await expect(status(page)).toHaveText('Markdown');
  await expect(pane(page, 'Preview')).toBeVisible();

  // A text file hides the Preview while it is open, and the Preview returns after.
  await item(page, 'Notes').click({ button: 'right' });
  await command(page, 'New text file').click();
  await typeName(page, 'todo.txt');
  await item(page, 'todo.txt').click();
  await expect(pane(page, 'Preview')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Panes' }).getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
  await item(page, 'Untitled.json').click();
  await expect(pane(page, 'Preview')).toBeVisible();
  await expect(status(page)).toHaveText('Valid');

  // A taken name is refused, with the reason.
  await item(page, 'todo.txt').click({ button: 'right' });
  await command(page, 'Rename').click();
  await typeName(page, 'PLAN.md');
  await expect(page.getByRole('alert')).toHaveText('There is already a PLAN.md here');
  await page.getByRole('textbox', { name: 'New name' }).press('Escape');
  await expect(item(page, 'todo.txt')).toBeVisible();
});

test('creates a diagram from any example, through submenus (URS-WS-002)', async ({ page }) => {
  await open(page);
  await page.locator('.files__body').click({ button: 'right', position: { x: 20, y: 300 } });
  await command(page, 'New diagram').click();
  await command(page, 'State diagram').click();
  await page.getByRole('menu', { name: 'State diagram' }).getByRole('menuitem').first().click();
  await page.getByRole('textbox', { name: 'New name' }).press('Enter');
  await expect(page.locator('.cm-content')).toContainText('"type": "state"');
  await expect(status(page)).toHaveText('Valid');
});

test('keeps unsaved edits across switching and reloading; Ctrl+S saves (URS-WS-004, WS-005)', async ({ page }) => {
  await open(page);
  await setSource(page, { version: '1', type: 'flowchart', title: 'Edited', nodes: [{ id: 'a' }] });
  await expect(item(page, 'Untitled.json')).toContainText('•');
  await expect(page.locator('.toolbar__file')).toContainText('•');
  await page.locator('.files__body').click({ button: 'right', position: { x: 20, y: 300 } });
  await command(page, 'New text file').click();
  await page.getByRole('textbox', { name: 'New name' }).press('Enter');
  await page.reload();
  await item(page, 'Untitled.json').click();
  await expect(page.locator('.cm-content')).toContainText('"title": "Edited"');
  await expect(item(page, 'Untitled.json')).toContainText('•');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(item(page, 'Untitled.json')).not.toContainText('•');
  await expect(page.locator('.toolbar__file')).toHaveText('Untitled.json');
});

test('works from the keyboard: arrows, Shift+F10 menu, F2, Delete with undo, trash (URS-WS-002, WS-022)', async ({ page }) => {
  await open(page);
  await item(page, 'Untitled.json').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await expect(command(page, 'New folder')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(command(page, 'New diagram')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await page.keyboard.press('F2');
  await typeName(page, 'Main.json');
  await expect(item(page, 'Main.json')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(item(page, 'Main.json')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(item(page, 'Main.json')).toBeVisible();

  await item(page, 'Main.json').click({ button: 'right' });
  await command(page, 'Delete').click();
  await page.getByRole('button', { name: /Trash \(1\)/ }).click();
  await page.getByRole('list', { name: 'Trash' }).getByRole('button', { name: 'Restore' }).click();
  await expect(item(page, 'Main.json')).toBeVisible();
});

test('moves by drag and drop, never into itself (URS-WS-003)', async ({ page }) => {
  await open(page);
  const body = page.locator('.files__body');
  for (const name of ['A', 'B']) {
    await body.click({ button: 'right', position: { x: 20, y: 300 } });
    await command(page, 'New folder').click();
    await typeName(page, name);
  }
  await item(page, 'Untitled.json').dragTo(item(page, 'A'));
  await item(page, 'A').click();
  await expect(item(page, 'Untitled.json')).toHaveAttribute('aria-level', '2');
  await item(page, 'A').dragTo(item(page, 'B'));
  await item(page, 'B').click();
  await expect(item(page, 'A')).toHaveAttribute('aria-level', '2');
  await expect(page.locator('.toolbar__file')).toHaveText('B/A/Untitled.json');
});

test('imports files, converting YAML diagrams, and exports a file or the workspace (URS-WS-005)', async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles([
    { name: 'door.yaml', mimeType: 'application/yaml', buffer: Buffer.from('version: "1"\ntype: state\ntitle: Door\nstates:\n  - id: closed\n    to: [{ state: open }]\n  - id: open\n') },
    { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') },
  ]);
  await expect(item(page, 'door.json')).toBeVisible();
  await expect(item(page, 'data.csv')).toBeVisible();
  await item(page, 'door.json').click();
  await expect(page.locator('.cm-content')).toContainText('"title": "Door"');

  await item(page, 'data.csv').click({ button: 'right' });
  const [file] = await Promise.all([page.waitForEvent('download'), command(page, 'Export').click()]);
  expect(file.suggestedFilename()).toBe('data.csv');
  expect(Buffer.concat(await (await file.createReadStream()).toArray()).toString()).toBe('a,b\n1,2\n');

  await page.getByRole('button', { name: 'Workspace actions' }).click();
  const [all] = await Promise.all([page.waitForEvent('download'), command(page, 'Export workspace').click()]);
  expect(all.suggestedFilename()).toBe('workspace.zip');
  const bytes = Buffer.concat(await (await all.createReadStream()).toArray());
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  for (const name of ['Untitled.json', 'door.json', 'data.csv']) expect(bytes.includes(Buffer.from(name))).toBe(true);
});

test('keeps every save: view an earlier version read-only and restore it as the newest; history survives a rename (URS-WS-020..022)', async ({ page }) => {
  await open(page);
  const versions = page.locator('.files__versions li');
  for (const title of ['One', 'Two', 'Three']) {
    await setSource(page, { version: '1', type: 'flowchart', title, nodes: [{ id: 'a' }] });
    await page.keyboard.press('ControlOrMeta+s');
    await expect(item(page, 'Untitled.json')).not.toContainText('•');
  }
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const history = page.getByRole('region', { name: 'History of Untitled.json' });
  // The first run's file, then three saves: newest first.
  await expect(versions).toHaveCount(4);
  await expect(versions.first()).toContainText('latest');

  // View version 2 (the save titled One): read-only, the Preview follows.
  await history.getByRole('button', { name: /^v2 / }).click();
  await expect(page.locator('.source__banner')).toContainText('Version 2 of Untitled.json');
  await expect(page.locator('.cm-content')).toContainText('"title": "One"');
  await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByTestId('preview')).toContainText('One');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('"title": "Three"');

  // Restore it: it becomes version 5, and nothing is lost.
  await versions.nth(2).getByRole('button', { name: 'Restore' }).click();
  await expect(versions).toHaveCount(5);
  await expect(page.locator('.cm-content')).toContainText('"title": "One"');
  await expect(page.getByText('Restored version 2 as version 5')).toBeVisible();

  // Renamed, it keeps its history.
  await item(page, 'Untitled.json').click({ button: 'right' });
  await command(page, 'Rename').click();
  await typeName(page, 'Flow.json');
  await expect(page.getByRole('region', { name: 'History of Flow.json' }).locator('.files__versions li')).toHaveCount(5);

  // It follows the open file, and the toggle hides it.
  await page.locator('.files__body').click({ button: 'right', position: { x: 20, y: 300 } });
  await command(page, 'New text file').click();
  await typeName(page, 'notes.txt');
  await item(page, 'notes.txt').click();
  await expect(page.getByRole('region', { name: 'History of notes.txt' }).locator('.files__versions li')).toHaveCount(1);
  await item(page, 'Flow.json').click();
  await expect(page.getByRole('region', { name: 'History of Flow.json' }).locator('.files__versions li')).toHaveCount(5);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.files__history')).toHaveCount(0);
});

test('closes the context menu on a click anywhere outside it, in the Files pane too (URS-WS-002)', async ({ page }) => {
  await open(page);
  await item(page, 'Untitled.json').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await page.locator('.files__body').click({ position: { x: 20, y: 300 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await item(page, 'Untitled.json').click({ button: 'right' });
  await page.getByRole('heading', { name: 'JTDDiagrammar' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('shows an example without making a file; Save makes it one (URS-WEB-007, WS-005)', async ({ page }) => {
  await open(page);
  const source = page.getByRole('region', { name: 'Source', exact: true });
  await source.getByLabel('Example').selectOption({ index: 1 });
  await expect(page.locator('.toolbar__file')).toContainText('(example, not saved yet)');
  await expect(status(page)).toHaveText('Valid');
  await expect(tree(page).getByRole('treeitem')).toHaveCount(1);
  const name = (await page.locator('.toolbar__file').textContent())!.replace(/ \(example.*$/, '');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(item(page, name)).toHaveAttribute('aria-selected', 'true');
  await expect(tree(page).getByRole('treeitem')).toHaveCount(2);
  await expect(page.locator('.toolbar__file')).toHaveText(name);
});
