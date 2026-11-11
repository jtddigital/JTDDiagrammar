import { expect, type Page } from '@playwright/test';

export const preview = (page: Page) => page.getByTestId('preview');
export const status = (page: Page) => page.getByRole('status');

/** Replace the editor contents in one input event. */
export async function setSource(page: Page, doc: unknown): Promise<string> {
  const text = typeof doc === 'string' ? doc : `${JSON.stringify(doc, null, 2)}\n`;
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  return text;
}

export async function open(page: Page) {
  await page.goto('/');
  await expect(preview(page)).toBeVisible();
}
