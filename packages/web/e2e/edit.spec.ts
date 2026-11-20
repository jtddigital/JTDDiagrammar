import { expect, test, type Page } from '@playwright/test';
import { open, preview, setSource, status } from './helpers.ts';

const doc = {
  version: '1',
  type: 'flowchart',
  nodes: [
    { id: 'a', label: 'Start', to: [{ node: 'b', label: 'go' }] },
    { id: 'b', label: 'Finish' },
  ],
};
const source = (page: Page) => page.locator('.cm-content');
const details = (page: Page) => page.getByRole('region', { name: 'Details', exact: true });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Edit diagram' });

test('the details pane shows and edits the selected element’s properties (URS-WEB-025)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  await expect(details(page)).toHaveCount(0);
  await preview(page).locator('[id="n-b"]').click();
  await bar(page).getByRole('button', { name: 'Details' }).click();
  const pane = details(page);
  await expect(pane).toContainText('Node · Finish');
  // The id is shown but not edited here.
  await expect(pane.getByRole('textbox', { name: 'id', exact: true })).toHaveValue('b');
  await expect(pane.getByRole('textbox', { name: 'id', exact: true })).toHaveAttribute('readonly', '');

  // A text field writes on Enter; a choice at once; the drawing follows.
  const label = pane.getByRole('textbox', { name: 'label', exact: true });
  await label.fill('Done');
  await label.press('Enter');
  await expect(source(page)).toContainText('"label": "Done"');
  await expect(preview(page).locator('[id="n-b"]')).toContainText('Done');
  await pane.getByLabel('shape', { exact: true }).selectOption('terminator');
  await expect(source(page)).toContainText('"shape": "terminator"');
  // Nested style, made when missing; clearing removes the property.
  await pane.getByRole('group', { name: 'style' }).getByLabel('bold', { exact: true }).selectOption('yes');
  await expect(source(page)).toContainText('"bold": true');
  await pane.getByLabel('shape', { exact: true }).selectOption('');
  await expect(source(page)).not.toContainText('"shape"');
  // Connections are elements too: their own fields.
  await preview(page).locator('[id^="e-"]').first().click();
  await expect(pane).toContainText('Connection');
  await pane.getByRole('textbox', { name: 'label', exact: true }).fill('next');
  await pane.getByRole('textbox', { name: 'label', exact: true }).press('Enter');
  await expect(source(page)).toContainText('"label": "next"');
  await expect(status(page)).toHaveText('Valid');
});

test('the diagram toolbar adds, connects and deletes elements (URS-WEB-026)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  // Add a decision: it gets a fresh id and is selected.
  await bar(page).getByLabel('Add').selectOption({ label: 'Decision' });
  await expect(preview(page).locator('[id="n-decision-1"]')).toBeVisible();
  await expect(source(page)).toContainText('"shape": "decision"');

  // Connect Finish → the decision: click Connect, then the two nodes.
  await bar(page).getByRole('button', { name: 'Connect' }).click();
  await expect(bar(page)).toContainText('Click the node to connect from');
  await preview(page).locator('[id="n-b"]').click();
  await expect(bar(page)).toContainText('Now click the node to connect to');
  await preview(page).locator('[id="n-decision-1"]').click();
  await expect(source(page)).toContainText('"node": "decision-1"');
  await expect(bar(page).getByRole('button', { name: 'Connect' })).toHaveAttribute('aria-pressed', 'false');
  await expect(status(page)).toHaveText('Valid');

  // Delete the selected decision: gone from the source (its incoming link now points nowhere, which the checks report).
  await preview(page).locator('[id="n-decision-1"]').click();
  await bar(page).getByRole('button', { name: 'Delete' }).click();
  await expect(source(page)).not.toContainText('"id": "decision-1"');
  await expect(status(page)).toHaveText('1 error');

  // A type without editing assets: Add and Connect are off; Details still works.
  const examples = page.getByRole('region', { name: 'Source', exact: true }).getByLabel('Example');
  await examples.selectOption((await examples.locator('option', { hasText: /lifecycle/i }).first().getAttribute('value'))!);
  await expect(status(page)).toHaveText('Valid');
  await expect(bar(page).getByLabel('Add')).toBeDisabled();
  await expect(bar(page).getByRole('button', { name: 'Connect' })).toBeDisabled();
  await expect(bar(page).getByRole('button', { name: 'Details' })).toBeEnabled();
});

test('Escape leaves connect mode without changing anything (URS-WEB-026)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const before = await source(page).textContent();
  await bar(page).getByRole('button', { name: 'Connect' }).click();
  await preview(page).locator('[id="n-a"]').click();
  await page.keyboard.press('Escape');
  await expect(bar(page).getByRole('button', { name: 'Connect' })).toHaveAttribute('aria-pressed', 'false');
  await preview(page).locator('[id="n-b"]').click();
  expect(await source(page).textContent()).toBe(before);
});
