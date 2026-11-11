import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { createRegistry, parseSource, parseXml, parseYaml, render, toXml } from '../src/index.ts';
import { goldenFixtures } from './fixtures.ts';

const reg = createRegistry();
const docs = [...goldenFixtures(), ...reg.types().flatMap((t) => t.examples.map((ex) => [`${t.id}-${ex.name}`, ex.source] as [string, unknown]))];

describe.each(docs)('XML and YAML give identical output: %s (URS-IN-006, URS-IN-007)', (_n, doc) => {
  const expected = render(doc, reg).svg;

  it('XML round trip renders byte-identical SVG', () => {
    const { value, diagnostics } = parseXml(toXml(doc), reg);
    expect(diagnostics).toEqual([]);
    expect(render(value, reg).svg).toBe(expected);
  });

  it('YAML renders byte-identical SVG', () => {
    expect(render(parseYaml(stringify(doc)).value, reg).svg).toBe(expected);
  });
});

describe('XML adapter', () => {
  it('reads hand-written XML with text elements, nested styles and numeric coercion', () => {
    const xml = `<?xml version="1.0"?>
<diagram version="1" type="flowchart" title="Hand &amp; written">
  <nodes>
    <node id="a" order="2"><label>Two
lines</label><style fill="#ffeeee"/></node>
    <node id="b"/>
  </nodes>
  <edges><edge from="a" to="b" label="go"/></edges>
</diagram>`;
    expect(parseXml(xml, reg).value).toEqual({
      version: '1',
      type: 'flowchart',
      title: 'Hand & written',
      nodes: [{ id: 'a', order: 2, label: 'Two\nlines', style: { fill: '#ffeeee' } }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b', label: 'go' }],
    });
  });

  it('nests composite states', () => {
    const xml = '<diagram version="1" type="state"><states><state id="c"><states><state id="x"/></states></state></states></diagram>';
    expect(parseXml(xml, reg).value).toEqual({ version: '1', type: 'state', states: [{ id: 'c', states: [{ id: 'x' }] }] });
  });

  it('refuses DOCTYPE, malformed XML and wrong roots', () => {
    const codes = (x: string) => parseXml(x, reg).diagnostics.map((d) => d.code);
    expect(codes('<!DOCTYPE x [<!ENTITY a "aaaa">]><diagram/>')).toEqual(['parse.xml']);
    expect(codes('<diagram><nodes></diagram>')).toEqual(['parse.xml']);
    expect(codes('<flowchart/>')).toEqual(['parse.xml']);
  });

  it('leaves unknown elements for validation to report with a pointer', () => {
    const { value } = parseXml('<diagram version="1" type="flowchart"><nodes/><colour/></diagram>', reg);
    expect(render(value, reg).diagnostics.map((d) => [d.code, d.path])).toEqual([['schema.additionalProperties', '/colour']]);
  });
});

describe('YAML adapter', () => {
  it('reports syntax errors and caps alias expansion', () => {
    expect(parseYaml('a: [1, 2').diagnostics[0]?.code).toBe('parse.yaml');
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x, x]', ...Array.from({ length: 8 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(10).fill(`*${String.fromCharCode(97 + i)}`).join(', ')}]`)].join('\n');
    expect(parseYaml(bomb).diagnostics[0]?.code).toBe('parse.yaml');
  });

  it('is selected by format', () => {
    expect(parseSource('version: "1"', 'yaml', reg).value).toEqual({ version: '1' });
    expect(parseSource('<diagram version="1"/>', 'xml', reg).value).toEqual({ version: '1' });
  });
});
