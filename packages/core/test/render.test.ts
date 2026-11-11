import { XMLValidator } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRegistry, Registry, render } from '../src/index.ts';
import { flowchart } from '../src/diagrams/flowchart/index.ts';
import { fixtures } from './fixtures.ts';

const reg = createRegistry();
const svg = (doc: unknown) => render(doc, reg).svg!;
const ALLOWED = new Set(['svg', 'title', 'defs', 'marker', 'path', 'rect', 'g', 'text']);

describe('SVG output', () => {
  it.each(fixtures())('%s is well-formed, standalone SVG 1.1 (URS-RN-001)', (_n, doc) => {
    const out = svg(doc);
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" version="1\.1"/);
    for (const [, tag] of out.matchAll(/<([a-zA-Z]+)/g)) expect(ALLOWED.has(tag!), tag).toBe(true);
  });

  it('escapes all user text and never emits script or foreignObject (URS-RN-004)', () => {
    const out = svg(JSON.parse(readFileSync(new URL('./golden/text.json', import.meta.url), 'utf8')));
    expect(out).not.toMatch(/<script|<foreignObject|<b>/i);
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&lt;b&gt;not bold&lt;/b&gt; &amp; &#39;single&#39;</text>');
    expect(out).toContain('>&quot;double&quot;</text>');
  });

  it('draws arrowheads on edges (URS-RN-003)', () => {
    const out = svg(reg.type('flowchart')!.examples[0]!.source);
    expect(out).toContain('<marker id="jtd-arrow"');
    expect(out.match(/marker-end="url\(#jtd-arrow\)"/g)).toHaveLength(5);
  });

  it('derives ids and classes from the model and type (URS-RN-005)', () => {
    const out = svg(reg.type('flowchart')!.examples[0]!.source);
    expect(out).toContain('class="jtd jtd-flowchart"');
    expect(out).toContain('<g id="n-known" class="jtd-node jtd-shape-decision" data-id="known"');
    expect(out).toContain('<g id="e-edge:2" class="jtd-edge" data-id="edge:2" data-from="known" data-to="send"');
  });

  it('reports a missing layout engine instead of throwing', () => {
    const r = render({ version: '1', type: 'flowchart', nodes: [] }, new Registry().registerType(flowchart));
    expect(r.svg).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['layout.engine']);
  });
});
