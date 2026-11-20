import { describe, expect, it } from 'vitest';
import { pdf, PdfPage, svgPath, typeset, winAnsi, type Block } from '../src/index.ts';

const ascii = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
/** Text shown with Tj, decoded from its hex string. */
const shown = (doc: string) => [...doc.matchAll(/<([0-9a-f]*)> Tj/g)].map((m) => m[1]!.match(/../g)?.map((h) => String.fromCharCode(parseInt(h, 16))).join('') ?? '');
/** A rough stand-in for Helvetica: half an em per character, wider when bold. */
const measure = (t: string, bold: boolean, size: number) => t.length * size * (bold ? 0.55 : 0.5);

/** Every object the cross-reference table lists starts where it says, and startxref points at the table. */
function checkStructure(doc: string) {
  expect(doc.startsWith('%PDF-1.4\n')).toBe(true);
  expect(doc.trimEnd().endsWith('%%EOF')).toBe(true);
  const start = Number(/startxref\n(\d+)/.exec(doc)![1]);
  expect(doc.slice(start, start + 4)).toBe('xref');
  const offsets = [...doc.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => expect(doc.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  // Stream lengths are exact.
  for (const m of doc.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) expect(doc.slice(m.index + m[0].length + Number(m[1]!), m.index + m[0].length + Number(m[1]!) + 10)).toBe('\nendstream');
  return offsets.length;
}

describe('SVG paths to PDF (URS-WS-046)', () => {
  it('turns every command into moves, lines and cubic curves, relative ones included', () => {
    expect(svgPath('M10 20L30 40H50V60Z').ops).toBe('10 20 m\n30 40 l\n50 40 l\n50 60 l\nh');
    expect(svgPath('m10 20l5 5h5v-10z').ops).toBe('10 20 m\n15 25 l\n20 25 l\n20 15 l\nh');
    // A quadratic is raised to a cubic with the same shape.
    expect(svgPath('M0 0Q30 30 60 0').ops).toBe('0 0 m\n20 20 40 20 60 0 c');
    expect(svgPath('M0 0C1 2 3 4 5 6S9 10 11 12').ops).toBe('0 0 m\n1 2 3 4 5 6 c\n7 8 9 10 11 12 c');
    // Implicit lines after a move.
    expect(svgPath('M0 0 10 0 10 10').ops).toBe('0 0 m\n10 0 l\n10 10 l');
  });

  it('draws arcs as cubic pieces through the right points, and reports the end direction for arrowheads', () => {
    const half = svgPath('M0 0A10 10 0 0 1 20 0');
    const ends = half.ops.split('\n').filter((l) => l.endsWith(' c')).map((l) => l.split(' ').slice(4, 6).map(Number));
    expect(ends.at(-1)).toEqual([20, 0]);
    expect(ends).toHaveLength(2);
    // The midpoint of the half circle is 10 below the chord (y down, sweep 1).
    expect(ends[0]![0]).toBeCloseTo(10);
    expect(Math.abs(ends[0]![1]!)).toBeCloseTo(10);
    const line = svgPath('M0 0L10 10');
    expect(line.end).toEqual({ x: 10, y: 10, angle: Math.PI / 4 });
    expect(line.start?.angle).toBeCloseTo(Math.PI / 4);
    expect(svgPath('M5 5a3 3 0 1 1 6 0a3 3 0 1 1 -6 0').ops.split('\n').filter((l) => l.endsWith(' c')).length).toBeGreaterThanOrEqual(4);
  });
});

describe('PDF writer (URS-WS-046, D-007)', () => {
  it('encodes text as Windows-1252, the standard fonts’ encoding', () => {
    expect(winAnsi('Aé€“”✓')).toEqual([0x41, 0xe9, 0x80, 0x93, 0x94, 0x3f]);
  });

  it('writes a well-formed document with pages, paths, text, transparency and links', () => {
    const p = new PdfPage(200, 100);
    p.rect(10, 10, 50, 20, { fill: [1, 0, 0], stroke: [0, 0, 0], width: 2, opacity: 0.5 });
    p.path('M0 0L100 100', { stroke: [0, 0, 1], dash: [4, 2] });
    p.text('Héllo (world)', 20, 50, 'Helvetica-Bold', 12);
    p.link(0, 0, 50, 20, 'https://example.com/a(b)');
    const doc = ascii(pdf([p, new PdfPage(200, 100)], { title: 'Plan' }));
    expect(checkStructure(doc)).toBe(3 + 7 + 2 * 2 + 1);
    expect(doc).toContain('/Count 2');
    expect(doc).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    expect(doc).toContain('/GS50 << /Type /ExtGState /ca 0.5 /CA 0.5 >>');
    expect(doc).toContain('/URI (https://example.com/a\\(b\\))');
    // The link rectangle is in PDF space, y up: the top 20 points of a 100-point page.
    expect(doc).toContain('/Rect [0 80 50 100]');
    expect(doc).toContain('/Title (Plan)');
    expect(shown(doc)).toEqual(['Héllo (world)']);
  });
});

describe('typesetting a flow into pages (URS-WS-046)', () => {
  it('wraps paragraphs to the measure and numbers the pages', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');
    const pages = typeset([{ kind: 'text', runs: [{ text: 'Title', bold: true }], size: 20 }, { kind: 'text', runs: [{ text: words }] }], { measure, title: 'Doc' });
    expect(pages.length).toBeGreaterThan(1);
    const doc = ascii(pdf(pages));
    checkStructure(doc);
    const text = shown(doc);
    expect(text).toContain('Title');
    expect(text).toContain(`1 / ${pages.length}`);
    // Every word arrives, in order, none split.
    expect(text.join(' ').match(/word\d+/g)).toEqual(words.split(' '));
  });

  it('repeats a table header on each page, and cuts code lines that do not fit', () => {
    const rows = [[[{ text: 'Item' }], [{ text: 'Cost' }]], ...Array.from({ length: 120 }, (_, i) => [[{ text: `Part ${i}` }], [{ text: String(i) }]])];
    const blocks: Block[] = [
      { kind: 'table', rows, header: true, align: [null, 'right'] },
      { kind: 'code', text: `${'x'.repeat(300)}\nshort` },
    ];
    const pages = typeset(blocks, { measure });
    const doc = ascii(pdf(pages));
    checkStructure(doc);
    const text = shown(doc);
    expect(text.filter((t) => t === 'Item').length).toBeGreaterThan(1);
    expect(text).toContain('Part 119');
    const code = text.filter((t) => /^x+$/.test(t));
    expect(code.join('')).toHaveLength(300);
    expect(code.length).toBeGreaterThan(1);
  });

  it('scales a graphic down to fit the page and captions it', () => {
    let drawn = 0;
    const pages = typeset([{ kind: 'graphic', width: 2000, height: 500, draw: (p) => (drawn++, p.rect(0, 0, 2000, 500, { stroke: [0, 0, 0] })), caption: 'Flow' }], { measure });
    expect(drawn).toBe(1);
    const doc = ascii(pdf(pages));
    // Scaled to the text width of an A4 page.
    const scale = Number(/^([\d.]+) 0 0 [\d.]+ [\d.]+ [\d.]+ cm$/m.exec(doc.split('\n').slice(1).join('\n'))?.[1]);
    expect(scale).toBeLessThan(0.3);
    expect(shown(doc)).toContain('Flow');
  });
});
