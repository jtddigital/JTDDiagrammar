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

  // Every type can add: an object lifecycle adds a state, drawn and selected.
  const examples = page.getByRole('region', { name: 'Source', exact: true }).getByLabel('Example');
  await examples.selectOption((await examples.locator('option', { hasText: /lifecycle/i }).first().getAttribute('value'))!);
  await expect(status(page)).toHaveText('Valid');
  await bar(page).getByLabel('Add').selectOption({ label: 'State' });
  await expect(source(page)).toContainText('"label": "New state"');
  await expect(preview(page)).toContainText('New state');
  await expect(status(page)).toHaveText('Valid');
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

const lanes = {
  version: '1',
  type: 'flowchart',
  lanes: [
    { id: 'ops', label: 'Operations' },
    { id: 'fin', label: 'Finance' },
  ],
  nodes: [
    { id: 'a', label: 'Start', lane: 'ops', to: [{ node: 'b', label: 'then' }] },
    { id: 'b', label: 'Pay', lane: 'fin' },
  ],
};

test('details refuse a value that does not fit or would break the diagram, and say why (URS-WEB-025)', async ({ page }) => {
  await open(page);
  await setSource(page, lanes);
  await expect(status(page)).toHaveText('Valid');
  await preview(page).locator('[id="n-b"]').click();
  await bar(page).getByRole('button', { name: 'Details' }).click();
  const pane = details(page);
  const style = pane.getByRole('group', { name: 'style' });
  const before = await source(page).textContent();

  // Does not fit the schema: the field keeps it, says why, and the source is untouched.
  const fill = style.getByRole('textbox', { name: 'fill', exact: true });
  await fill.fill('#zz0000');
  await fill.press('Enter');
  await expect(style.getByRole('alert')).toHaveText('Must be a hex colour, like #1d4ed8.');
  await expect(fill).toHaveValue('#zz0000');
  await expect(fill).toHaveAttribute('aria-invalid', 'true');
  expect(await source(page).textContent()).toBe(before);
  // Corrected, it is written and the warning goes.
  await fill.fill('#dbeafe');
  await fill.press('Enter');
  await expect(source(page)).toContainText('"fill": "#dbeafe"');
  await expect(style.getByRole('alert')).toHaveCount(0);

  // Fits the schema but breaks the diagram: with lanes, every node needs one.
  await pane.getByRole('combobox', { name: 'lane', exact: true }).selectOption('');
  await expect(pane.getByRole('alert').first()).toContainText('Not changed: the diagram would then have this problem');
  await expect(source(page)).toContainText('"lane": "fin"');
  await expect(status(page)).toHaveText('Valid');
});

test('references are chosen from the elements they may point at (URS-WEB-027)', async ({ page }) => {
  await open(page);
  await setSource(page, lanes);
  await expect(status(page)).toHaveText('Valid');
  await preview(page).locator('[id="n-b"]').click();
  await bar(page).getByRole('button', { name: 'Details' }).click();
  const pane = details(page);
  const lane = pane.getByRole('combobox', { name: 'lane', exact: true });
  await expect(lane.locator('option')).toHaveText(['—', 'Operations (ops)', 'Finance (fin)']);
  await expect(lane).toHaveValue('fin');
  await lane.selectOption('ops');
  await expect(source(page)).toContainText('"lane": "ops"');
  // A connection's target is chosen from the nodes.
  await preview(page).getByText('then', { exact: true }).click();
  const target = pane.getByRole('combobox', { name: 'node', exact: true });
  await expect(target.locator('option')).toHaveText(['—', 'Start (a)', 'Pay (b)']);
  await expect(target).toHaveValue('b');
});

test('connects lifecycle states with a user action (URS-WEB-026)', async ({ page }) => {
  await open(page);
  await setSource(page, { version: '1', type: 'lifecycle', actionsLane: true, states: [{ id: 'draft', label: 'Draft' }, { id: 'done', label: 'Done', stateType: 'final' }] });
  await expect(status(page)).toHaveText('Valid');
  await bar(page).getByRole('button', { name: 'Connect' }).click();
  await preview(page).locator('[id="n-state:draft"]').click();
  await preview(page).locator('[id="n-state:done"]').click();
  await expect(source(page)).toContainText('"state": "done"');
  await expect(status(page)).toHaveText('Valid');
});
