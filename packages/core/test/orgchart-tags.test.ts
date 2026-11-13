import { describe, expect, it } from 'vitest';
import { compile, createRegistry, parseXml, render, toXml } from '../src/index.ts';

const reg = createRegistry();
const chart = (extra: object) => ({ version: '1', type: 'orgchart', people: [{ id: 'a', name: 'A' }], ...extra });
const styleOf = (d: unknown, id: string) => compile(d, reg).ir!.nodes.find((n) => n.id === id)!.style;
const codes = (d: unknown) => compile(d, reg).diagnostics.map((x) => [x.severity, x.code, x.path]);

describe('org chart tags (URS-TYP-013)', () => {
  it("styles people by tag: the section default, then tags in the person's order, then their own style", () => {
    const d = chart({
      styles: { people: { fill: '#eeeeee', bold: true } },
      tags: { x: { fill: '#ff0000', dash: 'dashed' }, y: { fill: '#00ff00', opacity: 0.5 } },
      people: [
        { id: 'a', name: 'A', tags: ['x', 'y'] },
        { id: 'b', name: 'B', manager: 'a', tags: ['y', 'x'] },
        { id: 'c', name: 'C', manager: 'a', tags: ['x'], style: { fill: '#0000ff' } },
        { id: 'd', name: 'D', manager: 'a' },
        { id: 'e', name: 'E', manager: 'a', tags: ['y', 'unstyled'] },
      ],
    });
    expect(codes(d)).toEqual([]);
    expect(styleOf(d, 'a')).toEqual({ fill: '#00ff00', bold: true, dash: 'dashed', opacity: 0.5 });
    expect(styleOf(d, 'b')).toEqual({ fill: '#ff0000', bold: true, dash: 'dashed', opacity: 0.5 });
    expect(styleOf(d, 'c')).toEqual({ fill: '#0000ff', bold: true, dash: 'dashed' });
    expect(styleOf(d, 'd')).toEqual({ fill: '#eeeeee', bold: true });
    // A tag with no style is only a label.
    expect(styleOf(d, 'e')).toEqual({ fill: '#00ff00', bold: true, opacity: 0.5 });
    expect(render(d, reg).svg).toContain('#ff0000');
  });

  it('warns about a tag styled but worn by no one, and checks the shapes', () => {
    expect(codes(chart({ tags: { 'left over': { fill: '#ff0000' } } }))).toEqual([['warning', 'orgchart.tag', '/tags/left over']]);
    expect(codes(chart({ tags: { x: { fill: 'red-ish' } } })).map((c) => c[1])).toContain('schema.pattern');
    expect(codes(chart({ people: [{ id: 'a', name: 'A', tags: 'x' }] })).map((c) => c[1])).toContain('schema.type');
    expect(codes(chart({ people: [{ id: 'a', name: 'A', tags: [''] }] })).map((c) => c[1])).toContain('schema.minLength');
  });

  it('draws a legend of the styled tags in use, in the order styled, unless switched off (URS-DM-026)', () => {
    const d = chart({
      styles: { people: { bold: true } },
      tags: { open: { opacity: 0.5 }, contractor: { dash: 'dashed' }, spare: { fill: '#ff0000' } },
      people: [
        { id: 'a', name: 'A', tags: ['contractor', 'unstyled'] },
        { id: 'b', name: 'B', manager: 'a', tags: ['open'] },
      ],
    });
    expect(compile(d, reg).ir!.legend).toEqual([
      { label: 'open', shape: 'card', style: { bold: true, opacity: 0.5 } },
      { label: 'contractor', shape: 'card', style: { bold: true, dash: 'dashed' } },
    ]);
    const svg = render(d, reg).svg!;
    const legend = svg.slice(svg.indexOf('class="jtd-legend"'));
    expect(legend).toContain('>open<');
    expect(legend).toContain('>contractor<');
    // A faded tag's sample is faded too.
    expect(legend).toMatch(/<g transform="[^"]*" opacity="0.5">/);
    expect(compile({ ...d, legend: false }, reg).ir!.legend).toBeUndefined();
    expect(compile(chart({}), reg).ir!.legend).toBeUndefined();
  });

  it('reads tags from XML, and round-trips the example', () => {
    const xml = `<diagram version="1" type="orgchart"><tags><vip fill="#ffeeaa"/></tags><people><person id="a" name="A"><tags><tag>vip</tag></tags></person></people></diagram>`;
    expect(styleOf(parseXml(xml, reg).value, 'a')).toEqual({ fill: '#ffeeaa' });
    const ex = reg.type('orgchart')!.examples.find((e) => e.name === 'tags')!.source;
    expect(parseXml(toXml(ex), reg).value).toEqual(ex);
  });
});
