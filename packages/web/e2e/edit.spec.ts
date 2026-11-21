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
const palette = (page: Page, name: string) => bar(page).getByRole('group', { name: 'Add' }).getByRole('button', { name, exact: true });
/** A category of the details pane, opened. */
async function section(page: Page, name: string) {
  const s = details(page).locator(`details[data-section="${name}"]`);
  if ((await s.getAttribute('open')) === null) await s.locator('summary').click();
  return s;
}
/** Drag with the mouse from the middle of one element to the middle of another (or a point of the drawing). */
async function dragTo(page: Page, from: string, to: string | { x: number; y: number }) {
  const drawing = page.locator('.pane--preview .preview');
  const a = (await drawing.locator(from).boundingBox())!;
  const b = typeof to === 'string' ? (await drawing.locator(to).boundingBox())! : { ...to, width: 0, height: 0 };
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}
/** A point of the drawing area well away from the diagram and the zoom buttons. */
async function emptySpot(page: Page) {
  const r = (await page.locator('.pane--preview .preview').boundingBox())!;
  return { x: r.x + 90, y: r.y + r.height - 90 };
}

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
  // Nested style, in its category (closed until opened).
  await (await section(page, 'appearance')).getByLabel('bold', { exact: true }).selectOption('yes');
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
  // Add a decision: placed as a draft where clicked, then applied: it gets a fresh id and is selected.
  await palette(page, 'Decision').click();
  const spot = await emptySpot(page);
  await page.mouse.click(spot.x, spot.y);
  await expect(page.locator('[id="draft-decision-1"]')).toBeVisible();
  await page.getByRole('group', { name: 'Decision (not yet in the source)' }).getByRole('button', { name: 'Apply' }).click();
  await expect(preview(page).locator('[id="n-decision-1"]')).toBeVisible();
  await expect(source(page)).toContainText('"shape": "decision"');

  // Connect Finish → the decision: click Connect, then the two nodes.
  await bar(page).getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(bar(page)).toContainText('Click the shape to connect from');
  await preview(page).locator('[id="n-b"]').click();
  await expect(bar(page)).toContainText('Now click the shape to connect to');
  await preview(page).locator('[id="n-decision-1"]').click();
  await expect(source(page)).toContainText('"node": "decision-1"');
  await expect(bar(page).getByRole('button', { name: 'Connect', exact: true })).toHaveAttribute('aria-pressed', 'false');
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
  // From the keyboard, an addition goes straight into the source.
  await palette(page, 'State').focus();
  await page.keyboard.press('Enter');
  await expect(source(page)).toContainText('"label": "New state"');
  await expect(preview(page)).toContainText('New state');
  await expect(status(page)).toHaveText('Valid');
});

test('Escape leaves connect mode without changing anything (URS-WEB-026)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const before = await source(page).textContent();
  await bar(page).getByRole('button', { name: 'Connect', exact: true }).click();
  await preview(page).locator('[id="n-a"]').click();
  await page.keyboard.press('Escape');
  await expect(bar(page).getByRole('button', { name: 'Connect', exact: true })).toHaveAttribute('aria-pressed', 'false');
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
  const style = await section(page, 'appearance');
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
  await bar(page).getByRole('button', { name: 'Connect', exact: true }).click();
  await preview(page).locator('[id="n-state:draft"]').click();
  await preview(page).locator('[id="n-state:done"]').click();
  await expect(source(page)).toContainText('"state": "done"');
  await expect(status(page)).toHaveText('Valid');
});

test('details are in the categories the schema names, collapsible and remembered (URS-WEB-028)', async ({ page }) => {
  await open(page);
  await setSource(page, lanes);
  await expect(status(page)).toHaveText('Valid');
  await preview(page).locator('[id="n-b"]').click();
  await bar(page).getByRole('button', { name: 'Details' }).click();
  const pane = details(page);
  await expect(pane.locator('summary > span:first-child')).toHaveText(['General', 'Connections', 'Placement', 'Notes and sources', 'Appearance']);
  // Placement holds the lane, with how many are set; Appearance starts closed.
  const placement = pane.locator('details[data-section="placement"]');
  await expect(placement.locator('summary')).toContainText('1 set');
  await expect(placement.getByRole('combobox', { name: 'lane', exact: true })).toBeVisible();
  await expect(pane.locator('details[data-section="appearance"]')).not.toHaveAttribute('open');
  // Closing one is remembered, for other elements and after a reload.
  await placement.locator('summary').click();
  await expect(placement.getByRole('combobox', { name: 'lane', exact: true })).toBeHidden();
  await preview(page).locator('[id="n-a"]').click();
  await expect(pane.locator('details[data-section="placement"]')).not.toHaveAttribute('open');
  await page.reload();
  await preview(page).locator('[id="n-a"]').click();
  await expect(details(page).locator('details[data-section="placement"]')).not.toHaveAttribute('open');
});

test('a change is tried once typing pauses, with no Enter (URS-WEB-029)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  await preview(page).locator('[id="n-b"]').click();
  await bar(page).getByRole('button', { name: 'Details' }).click();
  const label = details(page).getByRole('textbox', { name: 'label', exact: true });
  await label.selectText();
  await label.pressSequentially('Done', { delay: 30 });
  await expect(source(page)).toContainText('"label": "Done"');
  await expect(label).toBeFocused();
  // A refused value waits in the field, with the reason.
  const fill = (await section(page, 'appearance')).getByRole('textbox', { name: 'fill', exact: true });
  await fill.pressSequentially('#zz', { delay: 30 });
  await expect(details(page).getByRole('alert')).toHaveText('Must be a hex colour, like #1d4ed8.');
  await expect(source(page)).not.toContainText('"fill"');
});

test('dragging one shape onto another connects them (URS-WEB-030)', async ({ page }) => {
  await open(page);
  await setSource(page, { version: '1', type: 'flowchart', nodes: [{ id: 'a', label: 'Start' }, { id: 'b', label: 'Pay' }] });
  await expect(status(page)).toHaveText('Valid');
  const before = (await preview(page).locator('[id="n-b"]').boundingBox())!;
  await dragTo(page, '[id="n-b"]', '[id="n-a"]');
  await expect(source(page)).toContainText('"node": "a"');
  await expect(preview(page).locator('[id^="e-"]')).toHaveCount(1);
  // Dropped on nothing, a shape goes back: the layout places shapes.
  await dragTo(page, '[id="n-a"]', await emptySpot(page));
  await expect(bar(page)).toContainText('Drop it on another shape to connect them');
  expect(await preview(page).locator('[id^="e-"]').count()).toBe(1);
  expect(before.width).toBeGreaterThan(0);
});

test('a shape is placed anywhere as a draft, and only goes in the source when applied or connected (URS-WEB-031)', async ({ page }) => {
  await open(page);
  await setSource(page, doc);
  await expect(status(page)).toHaveText('Valid');
  const before = await source(page).textContent();
  // Dragged from the palette onto the drawing: a draft where it was dropped, drawn as it will look.
  const spot = await emptySpot(page);
  await palette(page, 'Decision').dragTo(page.locator('.preview').first(), { targetPosition: { x: (await page.locator('.preview').first().boundingBox())!.width - 60, y: 80 } });
  const draft = page.locator('[id="draft-decision-1"]');
  await expect(draft).toBeVisible();
  await expect(page.locator('.draft')).toContainText('Decision?');
  expect(await source(page).textContent()).toBe(before);
  // Moved freely; still not in the source.
  const was = (await draft.boundingBox())!;
  await dragTo(page, '[id="draft-decision-1"]', spot);
  await expect.poll(async () => (await draft.boundingBox())!.y).toBeGreaterThan(was.y + 20);
  expect(await source(page).textContent()).toBe(before);
  // Another, discarded with Delete.
  await palette(page, 'Process').click();
  await page.mouse.click(spot.x + 150, spot.y);
  await expect(page.locator('[id="draft-process-1"]')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.locator('[id="draft-process-1"]')).toHaveCount(0);
  // Dragged onto a shape: written, connected and placed by the layout.
  const d = (await draft.boundingBox())!;
  const b = (await preview(page).locator('[id="n-b"]').boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(source(page)).toContainText('"id": "decision-1"');
  await expect(source(page)).toContainText('"node": "b"');
  await expect(draft).toHaveCount(0);
  await expect(preview(page).locator('[id="n-decision-1"]')).toBeVisible();
  await expect(status(page)).toHaveText('Valid');
});

test('a draft put in a lane goes in that lane when applied (URS-WEB-031)', async ({ page }) => {
  await open(page);
  await setSource(page, lanes);
  await expect(status(page)).toHaveText('Valid');
  const fin = (await preview(page).locator('[id="l-fin"]').boundingBox())!;
  // Placing works anywhere, lanes included.
  await palette(page, 'Decision').click();
  await page.mouse.click(fin.x + fin.width * 0.45, fin.y + fin.height / 2);
  await page.getByRole('group', { name: 'Decision (not yet in the source)' }).getByRole('button', { name: 'Apply' }).click();
  await expect(source(page)).toContainText(/"id": "decision-1",\s*"shape": "decision",\s*"label": "Decision\?",\s*"lane": "fin"/);
  await expect(preview(page).locator('[id="n-decision-1"]')).toBeVisible();
  await expect(status(page)).toHaveText('Valid');
});
