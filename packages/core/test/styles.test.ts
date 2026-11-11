import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';

const reg = createRegistry();
const flow = (extra: object = {}, node: object = {}, edge: object = {}) => ({
  version: '1',
  type: 'flowchart',
  nodes: [{ id: 'a', ...node }, { id: 'b' }],
  edges: [{ from: 'a', to: 'b', ...edge }],
  ...extra,
});
const svg = (d: unknown) => render(d, reg).svg!;

describe('styling and themes (URS-DM-010)', () => {
  it('applies node fill, stroke, text colour and dash', () => {
    const out = svg(flow({}, { style: { fill: '#ff0000', stroke: '#00ff00', text: '#0000ff', dash: 'dashed' } }));
    const a = out.match(/<g id="n-a"[^]*?<\/g>/)![0];
    expect(a).toContain('fill="#ff0000" stroke="#00ff00" stroke-width="1.5" stroke-dasharray="6 4"');
    expect(a).toContain('fill="#0000ff">a</text>');
  });

  it('gives each edge colour its own arrowhead', () => {
    const out = svg(flow({}, {}, { style: { stroke: '#dc2626', dash: 'dotted' } }));
    expect(out).toContain('<marker id="jtd-arrow-dc2626"');
    expect(out).toContain('stroke="#dc2626" stroke-width="1.5" stroke-dasharray="1.5 3" stroke-linecap="round" marker-end="url(#jtd-arrow-dc2626)"');
  });

  it('colours lane headers', () => {
    const out = svg({ ...flow({ lanes: [{ id: 'l', label: 'L', style: { fill: '#dbeafe', text: '#1e3a8a' } }] }), nodes: [{ id: 'a', lane: 'l' }, { id: 'b', lane: 'l' }] });
    expect(out).toMatch(/<g id="l-l"[^]*fill="#dbeafe"[^]*fill="#1e3a8a">L<\/text>/);
  });

  it('switches the palette with the theme, default output unchanged', () => {
    expect(svg(flow({ theme: 'dark' }))).toContain('fill="#0f172a"/><g font-family');
    expect(svg(flow({ theme: 'default' }))).toBe(svg(flow()));
  });

  it('styles state diagrams and composite states too', () => {
    const d = { version: '1', type: 'state', states: [{ id: 'c', style: { fill: '#fef3c7' }, states: [{ id: 'x', style: { stroke: '#ff00ff' } }] }], transitions: [] };
    const out = svg(d);
    expect(out).toMatch(/<g id="c-c"[^>]*><rect[^>]*fill="#fef3c7"/);
    expect(out).toMatch(/<g id="n-x"[^]*stroke="#ff00ff"/);
  });

  it('accepts only hex colours, so nothing else reaches an attribute', () => {
    for (const bad of ['red', '#12', 'url(#x)', '#fff" onload="x', '#ffffffff'])
      expect(compile(flow({}, { style: { fill: bad } }), reg).diagnostics.map((d) => d.code)).toEqual(['schema.pattern']);
    expect(compile(flow({}, { style: { glow: true } }), reg).diagnostics.map((d) => d.code)).toEqual(['schema.additionalProperties']);
  });
});
