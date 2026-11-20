/**
 * Pages from a flow of blocks (URS-WS-046): headings and paragraphs of styled runs wrapped to the measure,
 * lists and quotes by indent, code in Courier on a tint, rules, tables (header repeated on each page) and
 * vector graphics scaled to fit. Text widths come from the caller, so they match the app's own metrics.
 */
import { A4, MM, PdfPage, type FontName, type Rgb } from './write.ts';

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  color?: Rgb;
  link?: string;
}

export type Block =
  | { kind: 'text'; runs: Run[]; size?: number; indent?: number; before?: number; after?: number; marker?: string; bar?: boolean; tint?: Rgb }
  | { kind: 'code'; text: string; indent?: number; plain?: boolean }
  | { kind: 'rule' }
  | { kind: 'table'; rows: Run[][][]; header?: boolean; align?: ('left' | 'center' | 'right' | null)[]; size?: number }
  | { kind: 'graphic'; width: number; height: number; draw(page: PdfPage): void; caption?: string };

/** Width of `text` in Helvetica (bold or not) at `size` points. */
export type Measure = (text: string, bold: boolean, size: number) => number;

export interface FlowOptions {
  measure: Measure;
  size?: [number, number];
  margin?: number;
  /** Page numbers at the foot, with this title beside them. */
  title?: string;
}

const BODY = 10.5;
const MONO = 9;
const LEAD = 1.4;
const INK: Rgb = [0.12, 0.12, 0.11];
const MUTED: Rgb = [0.37, 0.36, 0.33];
const LINK: Rgb = [0.1, 0.34, 0.7];
const LINE: Rgb = [0.82, 0.8, 0.75];
const CODE_BG: Rgb = [0.955, 0.945, 0.92];

const fontOf = (r: Run): FontName => (r.mono ? (r.bold ? 'Courier-Bold' : r.italic ? 'Courier-Oblique' : 'Courier') : r.bold ? (r.italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : r.italic ? 'Helvetica-Oblique' : 'Helvetica');

interface Piece {
  run: Run;
  text: string;
  width: number;
}

export function typeset(blocks: readonly Block[], o: FlowOptions): PdfPage[] {
  const [W, H] = o.size ?? A4;
  const M = o.margin ?? 18 * MM;
  const foot = o.title !== undefined ? 18 : 0;
  const bottom = H - M - foot;
  const pages: PdfPage[] = [];
  let page = new PdfPage(W, H);
  pages.push(page);
  let y = M;
  const newPage = () => {
    page = new PdfPage(W, H);
    pages.push(page);
    y = M;
  };
  const room = (h: number) => {
    if (y + h > bottom && y > M) newPage();
  };
  const width = (r: Run, text: string, size: number) => (r.mono ? text.length * 0.6 * size : o.measure(text, Boolean(r.bold), size));

  /** Runs broken into lines no wider than `max`, words kept whole unless one alone is too wide. */
  const wrap = (runs: readonly Run[], size: number, max: number): Piece[][] => {
    const lines: Piece[][] = [[]];
    let used = 0;
    for (const run of runs) {
      for (const part of run.text.split(/(\n)/)) {
        if (part === '\n') {
          lines.push([]);
          used = 0;
          continue;
        }
        for (const word of part.match(/\s+|\S+/g) ?? []) {
          const space = /^\s/.test(word);
          if (space && used === 0) continue;
          let text = space ? ' ' : word;
          let w = width(run, text, size);
          if (!space && used + w > max && used > 0) {
            // Trailing space of the line goes.
            const last = lines.at(-1)!;
            const tail = last.at(-1);
            if (tail && /^ $/.test(tail.text)) last.pop();
            lines.push([]);
            used = 0;
          }
          // A word wider than the line is cut where it fills it.
          while (!space && w > max && text.length > 1) {
            let cut = text.length - 1;
            while (cut > 1 && width(run, text.slice(0, cut), size) > max - used) cut--;
            lines.at(-1)!.push({ run, text: text.slice(0, cut), width: width(run, text.slice(0, cut), size) });
            lines.push([]);
            used = 0;
            text = text.slice(cut);
            w = width(run, text, size);
          }
          lines.at(-1)!.push({ run, text, width: w });
          used += w;
        }
      }
    }
    return lines;
  };

  const drawLine = (parts: Piece[], x: number, baseline: number, size: number) => {
    // Pieces of one run on a line are drawn as one string, so text copied from the PDF reads naturally.
    const pieces: Piece[] = [];
    for (const p of parts) {
      const last = pieces.at(-1);
      if (last && last.run === p.run) pieces[pieces.length - 1] = { run: p.run, text: last.text + p.text, width: last.width + p.width };
      else pieces.push(p);
    }
    for (const p of pieces) {
      const color = p.run.color ?? (p.run.link ? LINK : INK);
      if (p.run.mono && p.text.trim()) page.rect(x - 1, baseline - size * 0.82, p.width + 2, size * 1.08, { fill: CODE_BG });
      page.text(p.text, x, baseline, fontOf(p.run), size, color);
      if (p.run.link) {
        page.line(x, baseline + 1.5, x + p.width, baseline + 1.5, { stroke: color, width: 0.5 });
        if (/^(https?:|mailto:)/i.test(p.run.link)) page.link(x, baseline - size, p.width, size * 1.3, p.run.link);
      }
      x += p.width;
    }
  };

  const table = (b: Extract<Block, { kind: 'table' }>) => {
    const size = b.size ?? 9;
    const pad = 4;
    const cols = Math.max(0, ...b.rows.map((r) => r.length));
    if (!cols) return;
    const avail = W - 2 * M;
    const natural = Array.from({ length: cols }, (_, c) => Math.max(24, ...b.rows.slice(0, 300).map((r, i) => (r[c] ?? []).reduce((s, run) => s + width({ ...run, bold: run.bold || (b.header && i === 0) }, run.text, size), 0) + 2 * pad)));
    const total = natural.reduce((s, w) => s + w, 0);
    // Columns keep their natural width when everything fits; otherwise they share the page by it, none below 36 pt.
    const widths = total <= avail ? natural : natural.map((w) => Math.max(Math.min(36, avail / cols), (w / total) * avail));
    const scale = Math.min(1, avail / widths.reduce((s, w) => s + w, 0));
    const ws = widths.map((w) => w * scale);
    const lineH = size * LEAD;
    const rowOf = (r: Run[][], head: boolean) => {
      const cells = ws.map((w, c) => wrap((r[c] ?? []).map((run) => ({ ...run, bold: run.bold || head })), size, w - 2 * pad));
      return { cells, h: Math.max(1, ...cells.map((l) => l.length)) * lineH + 2 * pad, head };
    };
    const drawRow = (row: ReturnType<typeof rowOf>) => {
      let x = M;
      if (row.head) page.rect(M, y, ws.reduce((s, w) => s + w, 0), row.h, { fill: CODE_BG });
      row.cells.forEach((lines, c) => {
        const align = b.align?.[c];
        lines.forEach((l, i) => {
          const lw = l.reduce((s, p) => s + p.width, 0);
          const dx = align === 'right' ? ws[c]! - 2 * pad - lw : align === 'center' ? (ws[c]! - 2 * pad - lw) / 2 : 0;
          drawLine(l, x + pad + dx, y + pad + i * lineH + size, size);
        });
        page.rect(x, y, ws[c]!, row.h, { stroke: LINE, width: 0.5 });
        x += ws[c]!;
      });
      y += row.h;
    };
    const head = b.header && b.rows[0] ? rowOf(b.rows[0], true) : undefined;
    y += 4;
    room((head?.h ?? 0) + lineH + 2 * pad);
    if (head) drawRow(head);
    for (const r of b.rows.slice(head ? 1 : 0)) {
      const row = rowOf(r, false);
      if (y + row.h > bottom && y > M) {
        newPage();
        if (head) drawRow(head);
      }
      drawRow(row);
    }
    y += 8;
  };

  for (const b of blocks) {
    if (b.kind === 'rule') {
      room(16);
      y += 8;
      page.line(M, y, W - M, y, { stroke: LINE, width: 0.75 });
      y += 8;
    } else if (b.kind === 'text') {
      const size = b.size ?? BODY;
      const indent = b.indent ?? 0;
      const lineH = size * LEAD;
      y += b.before ?? 0;
      const lines = wrap(b.runs, size, W - 2 * M - indent);
      const top = y;
      lines.forEach((l, i) => {
        if (y + lineH > bottom && y > M) newPage();
        if (i === 0 && b.marker) page.text(b.marker, M + indent - width({ text: b.marker }, b.marker, size) - 4, y + size, 'Helvetica', size, MUTED);
        drawLine(l, M + indent, y + size, size);
        y += lineH;
      });
      if (b.bar && page === pages.at(-1) && y > top) page.rect(M + indent - 10, top, 2.5, y - top, { fill: b.tint ?? LINE });
      y += b.after ?? size * 0.6;
    } else if (b.kind === 'code') {
      const size = MONO;
      const lineH = size * 1.35;
      const indent = b.indent ?? 0;
      const per = Math.max(10, Math.floor((W - 2 * M - indent - 12) / (0.6 * size)));
      const lines = b.text.replace(/\n$/, '').split('\n').flatMap((l) => (l.length <= per ? [l] : (l.match(new RegExp(`.{1,${per}}`, 'g')) ?? [l])));
      y += 2;
      let start = y;
      // The tint goes under the text, so lines are drawn a page's worth at a time.
      let chunk: string[] = [];
      const flush = () => {
        if (!chunk.length) return;
        const h = chunk.length * lineH + 6;
        if (!b.plain) page.rect(M + indent, start, W - 2 * M - indent, h, { fill: CODE_BG });
        chunk.forEach((l, i) => page.text(l, M + indent + 6, start + 3 + i * lineH + size, 'Courier', size, INK));
        y = start + h;
        chunk = [];
      };
      for (const l of lines) {
        if (start + (chunk.length + 1) * lineH + 6 > bottom && (chunk.length || start > M)) {
          flush();
          newPage();
          start = y;
        }
        chunk.push(l);
      }
      flush();
      y += 8;
    } else if (b.kind === 'table') table(b);
    else {
      const maxW = W - 2 * M;
      const scale = Math.min(1, maxW / b.width, (bottom - M - 20) / b.height);
      const h = b.height * scale + (b.caption ? 16 : 0);
      room(h + 8);
      const x = M + (maxW - b.width * scale) / 2;
      page.save();
      page.transform(scale, 0, 0, scale, x, y);
      b.draw(page);
      page.restore();
      y += b.height * scale + 4;
      if (b.caption) {
        const cw = o.measure(b.caption, false, 9);
        page.text(b.caption, M + (maxW - cw) / 2, y + 9, 'Helvetica-Oblique', 9, MUTED);
        y += 14;
      }
      y += 8;
    }
  }

  if (o.title !== undefined)
    pages.forEach((p, i) => {
      const label = `${i + 1} / ${pages.length}`;
      p.text(label, W - M - o.measure(label, false, 8), H - M / 2, 'Helvetica', 8, MUTED);
      if (o.title) p.text(o.title, M, H - M / 2, 'Helvetica', 8, MUTED);
    });
  return pages;
}
