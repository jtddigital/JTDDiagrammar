// @vitest-environment happy-dom
import { createRegistry, render } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../src/preview/sanitize.ts';

const reg = createRegistry();

describe('inline SVG sanitiser (URS-RN-004, URS-WEB-009)', () => {
  it('keeps every renderer output intact', () => {
    for (const t of reg.types())
      for (const ex of t.examples) {
        const svg = render(ex.source, reg).svg!;
        const el = sanitizeSvg(svg)!;
        expect(el.outerHTML.length, `${t.id}/${ex.name}`).toBeGreaterThan(svg.length * 0.95);
        expect(el.querySelectorAll('g[id]').length).toBe(svg.match(/<g id=/g)!.length);
      }
  });

  it('drops scripts, foreign content, handlers, links and external references', () => {
    const el = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10" onload="alert(1)">' +
        '<script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="javascript:alert(1)"><text>t</text></a>' +
        '<image href="http://evil/x.png"/><rect fill="url(http://evil/#p)" stroke="#000" onclick="alert(1)"/><g style="background:url(x)"/><use xlink:href="#r"/></svg>',
    )!;
    const out = el.outerHTML;
    expect(out).not.toMatch(/script|foreignObject|onload|onclick|href|image|<a|<use|url\(|evil|background/i);
    expect(out).toContain('stroke="#000"');
    const widths = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" stroke-width="2.5"/><rect stroke-width="calc(1px)"/></svg>')!.outerHTML;
    expect(widths).toContain('stroke-width="2.5"');
    expect(widths).not.toContain('calc');
  });

  it('rejects documents that are not SVG', () => {
    expect(sanitizeSvg('<html/>')).toBeUndefined();
    expect(sanitizeSvg('<svg')).toBeUndefined();
  });
});
