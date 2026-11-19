import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarkdown, renderHtml } from '../src/index.ts';

interface Example {
  example: number;
  section: string;
  extension: string;
  markdown: string;
  html: string;
}
const load = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, 'spec', name), 'utf8')) as Example[];

/** The spec suites at 100 % (URS-WS-040): every CommonMark 0.31.2 example, and the GFM extension examples. */
describe('CommonMark 0.31.2 spec (URS-WS-040)', () => {
  it.each(load('commonmark.json').map((e) => [`${e.example} ${e.section}`, e] as const))('example %s', (_name, e) => {
    expect(renderHtml(parseMarkdown(e.markdown))).toBe(e.html);
  });
});

describe('GitHub Flavored Markdown extensions (URS-WS-040)', () => {
  it.each(load('gfm.json').map((e) => [`${e.extension} ${e.example} ${e.section}`, e] as const))('%s', (_name, e) => {
    expect(renderHtml(parseMarkdown(e.markdown, { gfm: true }), { gfm: true })).toBe(e.html);
  });
});
