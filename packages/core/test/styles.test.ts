import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';

const reg = createRegistry();
const flow = (extra: object = {}, node: object = {}, edge: object = {}) => ({
  version: '1',
  type: 'flowchart',
  nodes: [{ id: 'a', ...node, to: [{ node: 'b', ...edge }] }, { id: 'b' }],
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
    const d = { version: '1', type: 'state', states: [{ id: 'c', style: { fill: '#fef3c7' }, states: [{ id: 'x', style: { stroke: '#ff00ff' } }] }] };
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

describe('provenance quotes (URS-AI-014)', () => {
  it('become escaped tooltips on nodes and edges', () => {
    const out = svg(flow({}, { quote: 'The <clerk> collects "forms"' }, { quote: 'then hands over' }));
    expect(out).toMatch(/<g id="n-a" [^>]*><title>The &lt;clerk&gt; collects &quot;forms&quot;<\/title>/);
    expect(out).toMatch(/<g id="e-edge:a:0" class="jtd-edge"><title>then hands over<\/title>/);
  });

  it('are optional and absent from output when unset', () => {
    expect(svg(flow())).not.toMatch(/<g id="n-a"[^>]*><title>/);
  });
});

describe('line thickness (URS-DM-014)', () => {
  it('sets node outline and detail thickness', () => {
    const a = svg(flow({}, { shape: 'subprocess', style: { lineWidth: 3 } })).match(/<g id="n-a"[^]*?<\/g>/)![0];
    expect(a.match(/stroke-width="3"/g)).toHaveLength(2);
  });

  it('thickens edges and scales their arrowheads; thin lines keep the default arrowhead', () => {
    const thick = svg(flow({}, {}, { style: { lineWidth: 3 } }));
    expect(thick).toContain('<marker id="jtd-arrow-w3" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="18" markerHeight="18"');
    expect(thick).toContain('stroke-width="3" marker-end="url(#jtd-arrow-w3)"');
    const coloured = svg(flow({}, {}, { style: { lineWidth: 2.5, stroke: '#dc2626' } }));
    expect(coloured).toContain('marker-end="url(#jtd-arrow-dc2626-w2_5)"');
    const thin = svg(flow({}, {}, { style: { lineWidth: 0.75 } }));
    expect(thin).toContain('stroke-width="0.75" marker-end="url(#jtd-arrow)"');
  });

  it('thickens lane, phase and container borders', () => {
    const lanes = svg({ ...flow({ lanes: [{ id: 'l', label: 'L', style: { lineWidth: 2 } }] }), nodes: [{ id: 'a', lane: 'l' }, { id: 'b', lane: 'l' }] });
    expect(lanes.match(/<g id="l-l"[^]*?<\/g>/)![0].match(/stroke-width="2"/g)).toHaveLength(2);
    const state = { version: '1', type: 'state', states: [{ id: 'c', style: { lineWidth: 4 }, states: [{ id: 'x' }] }] };
    expect(svg(state).match(/<g id="c-c"[^]*?<\/g>/)![0].match(/stroke-width="4"/g)).toHaveLength(2);
  });

  it('rejects thickness outside 0.5 to 8', () => {
    for (const lineWidth of [0.2, 9, '3'])
      expect(compile(flow({}, { style: { lineWidth } }), reg).diagnostics.map((d) => d.path)).toEqual(['/nodes/0/style/lineWidth']);
  });

  it('leaves default output unchanged', () => {
    expect(svg(flow({}, { style: { lineWidth: 1.5 } }, { style: { lineWidth: 1.5 } }))).toBe(svg(flow()));
  });
});
