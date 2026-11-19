import { describe, expect, it } from 'vitest';
import { highlight, language, mathmlString, parseMarkdown, slugger, texToMathml, type MdNode } from '../src/index.ts';

const md = (s: string) => parseMarkdown(s, { gfm: true, extras: true });
const kinds = (n: MdNode): string[] => [...n.children()].map((c) => c.type);

describe('Markdown extras for the viewer (URS-WS-041)', () => {
  it('reads GitHub alerts from a block quote’s first line', () => {
    const doc = md('> [!WARNING]\n> Mind the gap.\n\n> [!note]\n>\n> Second paragraph.\n\n> [!NOPE]\n> plain\n');
    const quotes = [...doc.children()];
    expect(quotes.map((q) => q.alert)).toEqual(['WARNING', 'NOTE', '']);
    expect(quotes[0]!.firstChild!.firstChild!.literal).toBe('Mind the gap.');
    expect(kinds(quotes[1]!)).toEqual(['paragraph']);
    // Without extras, an alert is an ordinary quote.
    expect(parseMarkdown('> [!NOTE]\n> x\n', { gfm: true }).firstChild!.alert).toBe('');
  });

  it('marks [[toc]] and [TOC] paragraphs, and reads front matter', () => {
    const doc = md('---\ntitle: Plan\nowner: Ops\n---\n# A\n\n[[toc]]\n\n[TOC]\n');
    expect(kinds(doc)).toEqual(['front_matter', 'heading', 'toc', 'toc']);
    expect(doc.firstChild!.literal).toBe('title: Plan\nowner: Ops');
    // Front matter only at the very start; a thematic break elsewhere stays one.
    expect(kinds(md('# A\n---\nx\n---\n'))).toEqual(['heading', 'thematic_break', 'heading']);
  });

  it('reads $ inline math and $$ blocks, but not prices', () => {
    const doc = md('Energy $E = mc^2$ costs $5 and $10.\n\n$$\n\\frac{a}{b}\n$$\n');
    const p = doc.firstChild!;
    expect(kinds(p)).toEqual(['text', 'math_inline', 'text']);
    expect([...p.children()][1]!.literal).toBe('E = mc^2');
    expect(doc.lastChild!.type).toBe('math_block');
    expect(doc.lastChild!.literal).toBe('\\frac{a}{b}\n');
    // Without extras, $ is text and the spec suites are untouched.
    expect(kinds(parseMarkdown('$x$', { gfm: true }).firstChild!)).toEqual(['text']);
  });

  it('makes heading slugs as GitHub does', () => {
    const slug = slugger();
    expect(['Hello World', 'Hello World', 'C++ & Rust!', 'Ünïcode — dash', 'Hello World'].map(slug)).toEqual(['hello-world', 'hello-world-1', 'c--rust', 'ünïcode--dash', 'hello-world-2']);
  });

  it('highlights common languages and leaves others plain', () => {
    const toks = highlight('const x = "a"; // note\nreturn 42;', 'ts');
    expect(toks.filter((t) => t.kind !== 'plain' && t.kind !== 'punct' && t.kind !== 'operator').map((t) => [t.kind, t.text.trim()])).toEqual([
      ['keyword', 'const'],
      ['string', '"a"'],
      ['comment', '// note'],
      ['keyword', 'return'],
      ['number', '42'],
    ]);
    expect(highlight('{"a": 1}', 'json').map((t) => t.kind)).toEqual(['punct', 'property', 'operator', 'plain', 'number', 'punct']);
    expect(highlight('x y', 'cobol')).toEqual([{ kind: 'plain', text: 'x y' }]);
    expect([language('yml'), language('bash x'), language('nope')]).toEqual(['yaml', 'shell', undefined]);
    // Every character is kept, in order.
    const src = 'def f(x):\n    return x ** 2  # square\n';
    expect(highlight(src, 'python').map((t) => t.text).join('')).toBe(src);
  });

  it('turns TeX into MathML: scripts, fractions, roots, symbols, fences, matrices, limits', () => {
    const m = (t: string, d = false) => mathmlString(texToMathml(t, d)).replace(/<annotation[^]*<\/annotation>/, '');
    expect(m('x^2_i')).toBe('<math><semantics><msubsup><mi>x</mi><mi>i</mi><mn>2</mn></msubsup></semantics></math>');
    expect(m('\\frac{1}{\\sqrt{2}}')).toContain('<mfrac><mn>1</mn><msqrt><mn>2</mn></msqrt></mfrac>');
    expect(m('\\sum_{k=1}^n k', true)).toContain('<munderover><mo largeop="true" movablelimits="true">∑</mo>');
    expect(m('\\sum_{k=1}^n k')).toContain('<msubsup><mo');
    expect(m('\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}')).toContain('<mo fence="true" stretchy="true">[</mo><mtable><mtr><mtd><mn>1</mn></mtd><mtd><mn>2</mn></mtd></mtr><mtr><mtd><mn>3</mn></mtd><mtd><mn>4</mn></mtd></mtr></mtable>');
    expect(m('a \\leq b \\to \\infty')).toBe('<math><semantics><mrow><mi>a</mi><mo>≤</mo><mi>b</mi><mo>→</mo><mi>∞</mi></mrow></semantics></math>');
    expect(m('\\unknown')).toContain('<merror><mtext>\\unknown</mtext></merror>');
    // Markup in the source is text in the result.
    expect(mathmlString(texToMathml('\\text{<b>x</b>}'))).toContain('<mtext>&lt;b&gt;x&lt;/b&gt;</mtext>');
  });
});
