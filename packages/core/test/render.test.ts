import { XMLValidator } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRegistry, Registry, render } from '../src/index.ts';
import { flowchart } from '../src/diagrams/flowchart/index.ts';
import { fixtures } from './fixtures.ts';

const reg = createRegistry();
const svg = (doc: unknown) => render(doc, reg).svg!;
/** SVG 1.1 elements we emit, and the attributes each may carry (URS-RN-001). */
const ALLOWED: Record<string, string[]> = {
  svg: ['xmlns', 'version', 'width', 'height', 'viewBox', 'class'],
  title: [],
  defs: [],
  marker: ['id', 'viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'markerUnits', 'orient'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'marker-end'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
  g: ['id', 'class', 'transform', 'font-family', 'font-size', 'fill', 'style', 'opacity'],
  text: ['x', 'y', 'text-anchor', 'font-size', 'font-weight', 'font-style', 'fill', 'class'],
};

describe('SVG output', () => {
  it.each(fixtures())('%s is well-formed, standalone SVG 1.1 (URS-RN-001)', (_n, doc) => {
    const out = svg(doc);
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" version="1\.1"/);
    for (const [, tag, attrs] of out.matchAll(/<([a-zA-Z]+)([^>]*)>/g)) {
      expect(ALLOWED[tag!], tag).toBeDefined();
      for (const [, name] of attrs!.matchAll(/\s([a-zA-Z:-]+)=/g)) expect(ALLOWED[tag!], `${tag}@${name}`).toContain(name);
    }
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
    expect(out).toContain('<g id="n-known" class="jtd-node jtd-shape-decision"');
    expect(out).toContain('<g id="e-edge:known:0" class="jtd-edge">');
  });

  it('draws lane and phase bands with headers (URS-RN-002)', () => {
    const out = svg(reg.type('flowchart')!.examples[1]!.source);
    expect(out.match(/class="jtd-lane"/g)).toHaveLength(3);
    expect(out.match(/class="jtd-phase"/g)).toHaveLength(2);
    expect(out).toContain('<g id="l-sales" class="jtd-lane">');
    expect(out).toMatch(/<g id="p-order" class="jtd-phase">.*>Order<\/text><\/g>/);
  });

  it('returns the IR so drawn elements map back to source (URS-WEB-009)', () => {
    const r = render(reg.type('flowchart')!.examples[0]!.source, reg);
    expect(r.ir!.nodes.map((n) => `n-${n.id}`)).toEqual(r.geometry!.nodes.map((n) => `n-${n.id}`));
    expect(r.ir!.nodes[0]!.src).toBe('/nodes/0');
  });

  it('reports a missing layout engine instead of throwing', () => {
    const r = render({ version: '1', type: 'flowchart', nodes: [] }, new Registry().registerType(flowchart));
    expect(r.svg).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['layout.engine']);
  });
});
