import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, type MarkdownLinks } from '../src/viewers/Markdown.tsx';
import { htmlParts, safeHref, safeSrc } from '../src/viewers/safeHtml.ts';

const links: MarkdownLinks = { open: () => true, read: async () => undefined };
const html = (md: string) => renderToStaticMarkup(createElement(Markdown, { text: md, links }));

describe('Markdown viewer (URS-WS-041, WS-042)', () => {
  it('renders GFM, alerts, anchors, a table of contents, front matter, code, math and footnotes', () => {
    const out = html(
      [
        '---',
        'owner: Ops',
        '---',
        '[[toc]]',
        '# Plan',
        '## Steps',
        '- [x] done',
        '- [ ] next',
        '',
        '| a | b |',
        '|:-|-:|',
        '| 1 | 2 |',
        '',
        '> [!TIP]',
        '> Use ~~old~~ new.',
        '',
        '```ts',
        'const x = 1;',
        '```',
        '',
        'Inline $a^2$ and a note[^n].',
        '',
        '[^n]: The note.',
      ].join('\n'),
    );
    expect(out).toContain('<table class="md-frontmatter"><tbody><tr><th scope="row">owner</th><td>Ops</td></tr></tbody></table>');
    expect(out).toContain('<nav class="md-toc" aria-label="Contents"><ul><li style="padding-inline-start:0em"><a href="#plan">Plan</a></li><li style="padding-inline-start:1em"><a href="#steps">Steps</a></li></ul></nav>');
    expect(out).toContain('<h1 id="md-plan">');
    expect(out).toContain('<input type="checkbox" disabled="" aria-label="Done" checked=""/>');
    expect(out).toContain('<th style="text-align:left">a</th><th style="text-align:right">b</th>');
    expect(out).toContain('<div class="md-alert" data-kind="tip" role="note"><p class="md-alert__title">Tip</p><p>Use <del>old</del> new.</p></div>');
    expect(out).toContain('<span class="tok-keyword">const</span>');
    expect(out).toContain('<math><semantics><msup><mi>a</mi><mn>2</mn></msup>');
    expect(out).toContain('<sup class="md-fnref" id="md-fnref-n"><a href="#fn-n">1</a></sup>');
    expect(out).toContain('<section class="md-footnotes" aria-label="Footnotes"><ol><li id="md-fn-n"><p>The note.</p>');
  });

  it('allows only a few HTML tags, never attributes, scripts or event handlers', () => {
    const out = html(
      [
        'Press <kbd>Ctrl</kbd>+<kbd onclick="x()">S</kbd> <img src=x onerror=alert(1)> <script>alert(2)</script> H<sub>2</sub>O',
        '',
        '<details open><summary>More</summary>',
        '<div style="color:red" onmouseover="steal()">hidden <iframe src="https://evil"></iframe>text</div>',
        '</details>',
        '',
        '<script>',
        'document.cookie',
        '</script>',
      ].join('\n'),
    );
    expect(out).toContain('Press <kbd>Ctrl</kbd>+<kbd>S</kbd>');
    expect(out).toContain('H<sub>2</sub>O');
    expect(out).toContain('<details open=""><summary>More</summary>');
    expect(out).not.toMatch(/<(?:script|iframe|img|div style)|on\w+=|alert\(|document\.cookie|steal/);
  });

  it('follows only safe links and images', () => {
    const out = html('[a](javascript:alert(1)) [b](JAVASCRIPT:x) [c](data:text/html,x) [d](https://x.org) [e](mailto:a@b.c) [f](notes/plan.md) [g](#plan) ![h](javascript:x) ![i](https://x.org/a.png)');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('data:text');
    expect(out).toContain('<a href="https://x.org" target="_blank" rel="noopener noreferrer">d</a>');
    expect(out).toContain('<a href="mailto:a@b.c" target="_blank" rel="noopener noreferrer">e</a>');
    expect(out).toContain('<a href="notes/plan.md" class="md-filelink">f</a>');
    expect(out).toContain('<img src="https://x.org/a.png" alt="i" loading="lazy" referrerPolicy="no-referrer"/>');
    expect(out).toContain('<span class="md-missing">h</span>');
    expect([safeHref('java\tscript:x'), safeHref(' javascript:x'), safeSrc('data:image/svg+xml,<svg/>'), safeSrc('data:text/html,x')]).toEqual([false, false, true, false]);
  });

  it('draws ```jtd blocks as diagrams, or says why not', () => {
    // Drawing happens in an effect; here the problems of a broken one show.
    expect(html('```jtd\n{ "version": "1", "type": "nope" }\n```')).toContain('md-missing');
  });

  it('splits HTML into allowed parts', () => {
    expect(htmlParts('a<b>b</b><kbd>c</kbd><br/><!-- x --><style>p{}</style>&amp;')).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
      { kind: 'open', tag: 'kbd' },
      { kind: 'text', text: 'c' },
      { kind: 'close', tag: 'kbd' },
      { kind: 'void', tag: 'br' },
      { kind: 'text', text: '&' },
    ]);
  });
});
