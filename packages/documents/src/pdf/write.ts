/**
 * A PDF writer built in the repo (D-007, URS-WS-046): pages of vector paths and text in the standard 14 fonts
 * (Helvetica is metric-compatible with the Liberation Sans the app measures with), colours, transparency and
 * links. Coordinates are in points with the origin at the top left and y going down, as in SVG and on screen.
 */
import { utf8 } from '../utf8.ts';
import { svgPath } from './path.ts';

export const FONTS = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Courier', 'Courier-Bold', 'Courier-Oblique'] as const;
export type FontName = (typeof FONTS)[number];
/** A colour as [r, g, b], each 0–1. */
export type Rgb = [number, number, number];

export interface Paint {
  fill?: Rgb;
  stroke?: Rgb;
  width?: number;
  dash?: number[];
  /** 0–1, for fill and stroke. */
  opacity?: number;
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

/** Points per millimetre, and the A4 page. */
export const MM = 72 / 25.4;
export const A4: [number, number] = [595.28, 841.89];

const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : String(Math.round(v * 1000) / 1000));

/** Windows-1252 bytes for the characters WinAnsiEncoding has; others become '?'. */
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out.push(cp >= 0x20 && cp < 0x7f ? cp : cp >= 0xa0 && cp <= 0xff ? cp : (CP1252[cp] ?? (cp === 0x9 ? 0x20 : 0x3f)));
  }
  return out;
}
const hex = (text: string) => `<${winAnsi(text).map((b) => b.toString(16).padStart(2, '0')).join('')}>`;

export class PdfPage {
  readonly width: number;
  readonly height: number;
  readonly ops: string[] = [];
  readonly links: { x: number; y: number; w: number; h: number; uri: string }[] = [];
  /** Opacities used, for the page's graphics states. */
  readonly alphas = new Set<number>();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    // Flip once: y down from the top, as in SVG.
    this.ops.push(`1 0 0 -1 0 ${n(height)} cm`);
  }

  save() {
    this.ops.push('q');
  }
  restore() {
    this.ops.push('Q');
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.ops.push(`${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)} cm`);
  }

  private paint(p: Paint): string | undefined {
    if (!p.fill && !p.stroke) return undefined;
    if (p.opacity !== undefined && p.opacity < 1) {
      const a = Math.round(Math.max(0, p.opacity) * 100) / 100;
      this.alphas.add(a);
      this.ops.push(`/GS${Math.round(a * 100)} gs`);
    }
    if (p.fill) this.ops.push(`${p.fill.map(n).join(' ')} rg`);
    if (p.stroke) {
      this.ops.push(`${p.stroke.map(n).join(' ')} RG`, `${n(p.width ?? 1)} w`, `[${(p.dash ?? []).map(n).join(' ')}] 0 d`);
      if (p.cap) this.ops.push(`${['butt', 'round', 'square'].indexOf(p.cap)} J`);
      if (p.join) this.ops.push(`${['miter', 'round', 'bevel'].indexOf(p.join)} j`);
    }
    return p.fill && p.stroke ? 'B' : p.fill ? 'f' : 'S';
  }

  /** Paint SVG path data. */
  path(d: string, p: Paint) {
    const ops = svgPath(d).ops;
    if (!ops) return;
    this.ops.push('q');
    const op = this.paint(p);
    this.ops.push(ops, op ?? 'n', 'Q');
  }

  rect(x: number, y: number, w: number, h: number, p: Paint) {
    this.ops.push('q');
    const op = this.paint(p);
    this.ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re`, op ?? 'n', 'Q');
  }

  line(x1: number, y1: number, x2: number, y2: number, p: Paint) {
    this.path(`M${x1} ${y1}L${x2} ${y2}`, p);
  }

  /** Text with its baseline at y. */
  text(s: string, x: number, y: number, font: FontName, size: number, color: Rgb = [0, 0, 0], opacity?: number) {
    if (!s) return;
    this.ops.push('q');
    this.paint({ fill: color, ...(opacity !== undefined && { opacity }) });
    this.ops.push(`BT /F${FONTS.indexOf(font) + 1} ${n(size)} Tf 1 0 0 -1 ${n(x)} ${n(y)} Tm ${hex(s)} Tj ET`, 'Q');
  }

  /** A clickable area that opens a web address. */
  link(x: number, y: number, w: number, h: number, uri: string) {
    this.links.push({ x, y, w, h, uri });
  }
}

const pdfString = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;

/** The document's bytes. */
export function pdf(pages: readonly PdfPage[], info: { title?: string; producer?: string } = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  // 1 catalog, 2 pages, 3 info, then fonts, then per page: page, contents, annotations.
  const fontBase = 4;
  const pageBase = fontBase + FONTS.length;
  const kids: number[] = [];
  let next = pageBase;
  const plan = pages.map((p) => {
    const page = next;
    const contents = next + 1;
    const annots = p.links.map((_, i) => next + 2 + i);
    next += 2 + p.links.length;
    kids.push(page);
    return { page, contents, annots };
  });
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  add(`<< /Producer ${pdfString(info.producer ?? 'JTDDiagrammar')}${info.title ? ` /Title ${pdfString(info.title)}` : ''} >>`);
  for (const f of FONTS) add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`);
  const fonts = FONTS.map((_, i) => `/F${i + 1} ${fontBase + i} 0 R`).join(' ');
  pages.forEach((p, i) => {
    const { contents, annots } = plan[i]!;
    const gs = [...p.alphas].map((a) => `/GS${Math.round(a * 100)} << /Type /ExtGState /ca ${n(a)} /CA ${n(a)} >>`).join(' ');
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.width)} ${n(p.height)}] /Resources << /Font << ${fonts} >>${gs ? ` /ExtGState << ${gs} >>` : ''} >> /Contents ${contents} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>`,
    );
    const stream = p.ops.join('\n');
    add(`<< /Length ${utf8(stream).length} >>\nstream\n${stream}\nendstream`);
    for (const l of p.links) {
      // Annotation rectangles are in PDF space: y up from the bottom.
      add(`<< /Type /Annot /Subtype /Link /Border [0 0 0] /Rect [${n(l.x)} ${n(p.height - l.y - l.h)} ${n(l.x + l.w)} ${n(p.height - l.y)}] /A << /S /URI /URI ${pdfString(l.uri)} >> >>`);
    }
  });
  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  // Offsets count bytes; everything but the binary comment line is ASCII.
  let bytes = 15;
  const parts: string[] = [];
  objects.forEach((o, i) => {
    offsets.push(bytes);
    const s = `${i + 1} 0 obj\n${o}\nendobj\n`;
    parts.push(s);
    bytes += utf8(s).length;
  });
  const xref = bytes;
  body += parts.join('');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // The header's comment holds four bytes above 127, as the PDF specification advises for binary content.
  const head = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  const rest = utf8(body.slice('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'.length));
  const out = new Uint8Array(head.length + rest.length);
  out.set(head);
  out.set(rest, head.length);
  return out;
}
