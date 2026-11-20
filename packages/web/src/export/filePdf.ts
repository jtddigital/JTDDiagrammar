import { parseJson, parseSource, render, textWidth, type SourceFormat } from '@jtd/core';
import { A4, parseCsv, parseMarkdown, pdf, PdfPage, plainText, typeset, xlsx, type Block, type MdNode, type Run } from '@jtd/documents';
import { registry } from '../registry.ts';
import { htmlParts } from '../viewers/safeHtml.ts';
import { kindOf } from '../workspace/kinds.ts';
import { drawSvg, parseSvg, svgSize } from './svgPdf.ts';

/** Reads another workspace file by a path relative to the file being exported. */
export type Read = (path: string) => Promise<string | undefined>;

const measure = (text: string, bold: boolean, size: number) => textWidth(text, { size, bold });
/** SVG pixels to PDF points. */
const PT = 0.75;
const HEADING = [20, 16, 13.5, 12, 11, 10.5];
const MAX_DEPTH = 3;
const deflateRaw = async (bytes: Uint8Array) => new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

/** A diagram's drawing, or undefined when it does not draw. */
function drawing(source: string, format: SourceFormat = 'json'): { svg: Element; width: number; height: number } | undefined {
  const parsed = format === 'json' ? parseJson(source) : parseSource(source, format, registry);
  const r = parsed.value === undefined ? undefined : render(parsed.value, registry);
  if (!r?.svg) return undefined;
  const svg = parseSvg(r.svg);
  return { svg, ...svgSize(svg) };
}

const graphic = (d: NonNullable<ReturnType<typeof drawing>>, caption?: string): Block => ({
  kind: 'graphic',
  width: d.width * PT,
  height: d.height * PT,
  draw: (page) => {
    page.transform(PT, 0, 0, PT, 0, 0);
    drawSvg(page, d.svg);
  },
  ...(caption && { caption }),
});

const tableOf = (text: string, name: string, size?: number): Block => {
  const rows = parseCsv(text, name.toLowerCase().endsWith('.tsv') ? '\t' : undefined).rows;
  return { kind: 'table', rows: rows.map((r) => r.map((c) => [{ text: c }])), header: true, ...(size && { size }) };
};

/** Inline nodes as styled runs. */
function runs(parent: MdNode, style: Omit<Run, 'text'> = {}): Run[] {
  const out: Run[] = [];
  for (const n of parent.children()) {
    switch (n.type) {
      case 'text':
        out.push({ ...style, text: n.literal });
        break;
      case 'softbreak':
        out.push({ ...style, text: ' ' });
        break;
      case 'linebreak':
        out.push({ ...style, text: '\n' });
        break;
      case 'emph':
        out.push(...runs(n, { ...style, italic: true }));
        break;
      case 'strong':
        out.push(...runs(n, { ...style, bold: true }));
        break;
      case 'strikethrough':
        out.push(...runs(n, style));
        break;
      case 'code':
        out.push({ ...style, text: n.literal, mono: true });
        break;
      case 'link':
        out.push(...runs(n, { ...style, link: n.destination }));
        break;
      case 'image':
        out.push({ ...style, text: `[${plainText(n) || 'image'}]`, italic: true });
        break;
      case 'math_inline':
        out.push({ ...style, text: n.literal, mono: true, italic: true });
        break;
      case 'footnote_ref':
        out.push({ ...style, text: `[${n.index || '?'}]` });
        break;
      case 'html_inline':
        break;
      default:
        out.push(...runs(n, style));
    }
  }
  return out;
}

const EMBED = /^!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/;

/** Markdown blocks for the page flow, embedded files and ```jtd diagrams drawn (URS-WS-044, WS-046). */
async function markdownBlocks(doc: MdNode, read: Read, depth: number): Promise<Block[]> {
  const out: Block[] = [];
  const headings: string[] = [];
  const collect = (n: MdNode) => {
    for (const c of n.children())
      if (c.type === 'heading') headings.push(`${'  '.repeat(c.level - 1)}${plainText(c)}`);
      else if (['block_quote', 'list', 'item'].includes(c.type)) collect(c);
  };
  collect(doc);
  const notes: MdNode[] = [];

  const embed = async (path: string, caption: string, indent: number): Promise<Block[]> => {
    const text = await read(path);
    if (text === undefined) return [{ kind: 'text', runs: [{ text: `${caption || path} (no such file in the workspace)`, italic: true }], indent }];
    const name = path.split('/').pop() ?? path;
    const k = kindOf(name, text, registry);
    if (k.kind === 'diagram') {
      const d = drawing(text, k.format);
      return d ? [graphic(d, caption || name)] : [{ kind: 'text', runs: [{ text: `${name}: does not draw`, italic: true }], indent }];
    }
    if (k.kind === 'csv') return [tableOf(text, name, 8.5)];
    if (k.kind === 'markdown') return depth >= MAX_DEPTH ? [] : markdownBlocks(parseMarkdown(text, { gfm: true, extras: true }), read, depth + 1);
    return [{ kind: 'code', text, indent }];
  };

  const blocks = async (parent: MdNode, indent: number, bar = false) => {
    for (const n of parent.children()) await block(n, indent, bar);
  };

  const block = async (n: MdNode, indent: number, bar: boolean, marker?: string): Promise<void> => {
    switch (n.type) {
      case 'paragraph': {
        const only = n.firstChild && !n.firstChild.next ? n.firstChild : undefined;
        const wiki = only?.type === 'text' ? EMBED.exec(only.literal.trim()) : null;
        if (wiki) return void out.push(...(await embed(wiki[1]!.trim(), wiki[2]?.trim() ?? '', indent)));
        if (only?.type === 'image' && !/^[a-z][a-z0-9+.-]*:/i.test(only.destination)) return void out.push(...(await embed(decodeURIComponent(only.destination), plainText(only), indent)));
        out.push({ kind: 'text', runs: runs(n), indent, bar, ...(marker && { marker }) });
        return;
      }
      case 'heading':
        out.push({ kind: 'text', runs: runs(n, { bold: true }), size: HEADING[n.level - 1] ?? 10.5, before: n.level <= 2 ? 10 : 6, after: 4, indent });
        return;
      case 'thematic_break':
        out.push({ kind: 'rule' });
        return;
      case 'block_quote':
        if (n.alert) out.push({ kind: 'text', runs: [{ text: n.alert[0] + n.alert.slice(1).toLowerCase(), bold: true }], indent: indent + 12, bar: true, after: 2 });
        await blocks(n, indent + 12, true);
        return;
      case 'list': {
        let i = n.listData.start ?? 1;
        for (const item of n.children()) {
          const mark = item.checked !== undefined ? (item.checked ? '[x]' : '[  ]') : n.listData.type === 'bullet' ? '•' : `${i++}${n.listData.delimiter ?? '.'}`;
          let first = true;
          for (const c of item.children()) {
            await block(c, indent + 18, bar, first ? mark : undefined);
            first = false;
          }
          if (first) out.push({ kind: 'text', runs: [{ text: '' }], indent: indent + 18, marker: mark });
        }
        return;
      }
      case 'code_block': {
        if (n.info.split(/\s+/)[0]?.toLowerCase() === 'jtd') {
          const d = drawing(n.literal) ?? drawing(n.literal, 'yaml');
          if (d) return void out.push(graphic(d));
        }
        out.push({ kind: 'code', text: n.literal, indent });
        return;
      }
      case 'html_block': {
        const text = htmlParts(n.literal)
          .map((p) => (p.kind === 'text' ? p.text : p.kind === 'void' ? '\n' : ''))
          .join('')
          .trim();
        if (text) out.push({ kind: 'text', runs: [{ text }], indent, bar });
        return;
      }
      case 'table': {
        const rows = [...n.children()].map((r) => [...r.children()].map((c) => runs(c)));
        const first = n.firstChild;
        out.push({ kind: 'table', rows, header: true, align: first ? [...first.children()].map((c) => c.align[0] ?? null) : [] });
        return;
      }
      case 'math_block':
        out.push({ kind: 'code', text: n.literal.trim(), indent });
        return;
      case 'front_matter':
        out.push({ kind: 'code', text: n.literal, indent });
        return;
      case 'toc':
        out.push({ kind: 'text', runs: [{ text: 'Contents', bold: true }], indent, after: 2 });
        for (const h of headings) out.push({ kind: 'text', runs: [{ text: h.trimStart() }], indent: indent + 6 * (h.length - h.trimStart().length), after: 1 });
        return;
      case 'footnote_definition':
        notes.push(n);
        return;
      default:
        await blocks(n, indent, bar);
    }
  };

  await blocks(doc, 0);
  const numbered = notes.filter((d) => d.index).sort((a, b) => a.index - b.index);
  if (numbered.length) {
    out.push({ kind: 'rule' });
    for (const d of numbered) {
      let first = true;
      for (const c of d.children()) {
        await block(c, 18, false, first ? `${d.index}.` : undefined);
        first = false;
      }
    }
  }
  return out;
}

/** A file as a PDF (URS-WS-046): a diagram on a page its own size, in vectors; other files typeset on A4. */
export async function filePdf(name: string, text: string, read: Read): Promise<Uint8Array> {
  const k = kindOf(name, text, registry);
  const title = name.replace(/\.[^.]+$/, '');
  if (k.kind === 'diagram') {
    const d = drawing(text, k.format);
    if (d) {
      const page = new PdfPage(d.width * PT, d.height * PT);
      page.transform(PT, 0, 0, PT, 0, 0);
      drawSvg(page, d.svg);
      return pdf([page], { title });
    }
  }
  if (k.kind === 'markdown') return pdf(typeset(await markdownBlocks(parseMarkdown(text, { gfm: true, extras: true }), read, 0), { measure, title: name }), { title });
  if (k.kind === 'csv') {
    const cols = Math.max(0, ...parseCsv(text).rows.slice(0, 50).map((r) => r.length));
    const size: [number, number] = cols > 6 ? [A4[1], A4[0]] : A4;
    return pdf(typeset([{ kind: 'text', runs: [{ text: name, bold: true }], size: 14, after: 6 }, tableOf(text, name)], { measure, title: name, size }), { title });
  }
  // Text, and a diagram that does not draw: the text as it is.
  return pdf(typeset([{ kind: 'code', text, plain: true }], { measure, title: name }), { title });
}

/** A CSV file as an Excel workbook (URS-WS-045). */
export const csvXlsx = (name: string, text: string) => xlsx(parseCsv(text, name.toLowerCase().endsWith('.tsv') ? '\t' : undefined).rows, name.replace(/\.[^.]+$/, ''), deflateRaw);
