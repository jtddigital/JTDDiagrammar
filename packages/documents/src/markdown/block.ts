import { normalizeLabel, OPENTAG, CLOSETAG, unescapeString } from './common.ts';
import { InlineParser } from './inline.ts';
import { MdNode, type Align, type ListData, type NodeType } from './node.ts';

export interface MarkdownOptions {
  /** GitHub Flavored Markdown: tables, task lists, strikethrough, extended autolinks, footnotes. */
  gfm?: boolean;
  /** The viewer's extras (URS-WS-041): `$` and `$$` math, front matter. */
  extras?: boolean;
}

const CODE_INDENT = 4;
const reHtmlBlockOpen = [
  /./,
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i,
  new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`, 'i'),
];
const reHtmlBlockClose = [/./, /<\/(?:script|pre|textarea|style)>/i, /-->/, /\?>/, />/, /\]\]>/];
const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const reMaybeSpecial = /^[#`~*+_=<>0-9-|[$:]/;
const reNonSpace = /[^ \t\f\v\r\n]/;
const reBulletListMarker = /^[*+-]/;
const reOrderedListMarker = /^(\d{1,9})([.)])/;
const reATXHeadingMarker = /^#{1,6}(?:[ \t]+|$)/;
const reCodeFence = /^`{3,}(?!.*`)|^~{3,}/;
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/;
const reLineEnding = /\r\n|\n|\r/;
const reFootnoteDef = /^\[\^([^\]\s]+)\]:[ \t]*/;
const reMathFence = /^\$\$[ \t]*$/;

const isBlank = (s: string) => !reNonSpace.test(s);
const isSpaceOrTab = (c: string | undefined) => c === ' ' || c === '\t';

interface Behaviour {
  continue(p: BlockParser, block: MdNode): 0 | 1 | 2;
  finalize(p: BlockParser, block: MdNode): void;
  canContain(t: NodeType): boolean;
  acceptsLines: boolean;
}

const leaf = { canContain: () => false };

/**
 * The block parser of the CommonMark reference implementation (commonmark.js), in TypeScript, with GFM tables,
 * task list items and footnote definitions, and the viewer's math blocks and front matter.
 */
export class BlockParser {
  doc = new MdNode('document', 1);
  tip: MdNode = this.doc;
  oldtip: MdNode = this.doc;
  currentLine = '';
  lineNumber = 0;
  offset = 0;
  column = 0;
  nextNonspace = 0;
  nextNonspaceColumn = 0;
  indent = 0;
  indented = false;
  blank = false;
  partiallyConsumedTab = false;
  allClosed = true;
  lastMatchedContainer: MdNode = this.doc;
  lastLineLength = 0;
  readonly inline: InlineParser;
  readonly gfm: boolean;
  readonly extras: boolean;

  constructor(options: MarkdownOptions = {}) {
    this.gfm = !!options.gfm;
    this.extras = !!options.extras;
    this.inline = new InlineParser({ gfm: this.gfm, math: this.extras });
  }

  private readonly blocks: Record<string, Behaviour> = {
    document: { continue: () => 0, finalize: () => {}, canContain: (t) => t !== 'item', acceptsLines: false },
    list: {
      continue: () => 0,
      finalize: (_p, block) => {
        // Loose when a blank line separates items, or two blocks inside an item.
        for (let item = block.firstChild; item; item = item.next) {
          if (item.next && endsWithBlankLine(item)) {
            block.listData.tight = false;
            break;
          }
          let found = false;
          for (let sub = item.firstChild; sub; sub = sub.next)
            if (sub.next && endsWithBlankLine(sub)) {
              block.listData.tight = false;
              found = true;
              break;
            }
          if (found) break;
        }
        if (block.lastChild) block.endLine = block.lastChild.endLine;
      },
      canContain: (t) => t === 'item',
      acceptsLines: false,
    },
    block_quote: {
      continue: (p) => {
        const ln = p.currentLine;
        if (!p.indented && ln[p.nextNonspace] === '>') {
          p.advanceNextNonspace();
          p.advanceOffset(1, false);
          if (isSpaceOrTab(ln[p.offset])) p.advanceOffset(1, true);
          return 0;
        }
        return 1;
      },
      finalize: () => {},
      canContain: (t) => t !== 'item',
      acceptsLines: false,
    },
    item: {
      continue: (p, c) => {
        if (p.blank) {
          if (c.firstChild === null) return 1;
          p.advanceNextNonspace();
        } else if (p.indent >= c.listData.markerOffset + c.listData.padding) p.advanceOffset(c.listData.markerOffset + c.listData.padding, true);
        else return 1;
        return 0;
      },
      finalize: (_p, block) => {
        block.endLine = block.lastChild ? block.lastChild.endLine : block.line;
      },
      canContain: (t) => t !== 'item',
      acceptsLines: false,
    },
    footnote_definition: {
      continue: (p) => {
        if (p.indent >= CODE_INDENT) p.advanceOffset(CODE_INDENT, true);
        else if (p.blank) p.advanceNextNonspace();
        else return 1;
        return 0;
      },
      finalize: (_p, block) => {
        block.endLine = block.lastChild ? block.lastChild.endLine : block.line;
      },
      canContain: (t) => t !== 'item',
      acceptsLines: false,
    },
    heading: { ...leaf, continue: () => 1, finalize: () => {}, acceptsLines: false },
    thematic_break: { ...leaf, continue: () => 1, finalize: () => {}, acceptsLines: false },
    front_matter: { ...leaf, continue: () => 1, finalize: () => {}, acceptsLines: false },
    code_block: {
      ...leaf,
      continue: (p, c) => {
        const ln = p.currentLine;
        const indent = p.indent;
        if (c.fenced) {
          const m = indent <= 3 && ln[p.nextNonspace] === c.fenceChar ? reClosingCodeFence.exec(ln.slice(p.nextNonspace)) : null;
          if (m && m[0].length >= c.fenceLength) {
            p.lastLineLength = p.offset + indent + m[0].length;
            p.finalize(c, p.lineNumber);
            return 2;
          }
          for (let i = c.fenceOffset; i > 0 && isSpaceOrTab(ln[p.offset]); i--) p.advanceOffset(1, true);
        } else if (indent >= CODE_INDENT) p.advanceOffset(CODE_INDENT, true);
        else if (p.blank) p.advanceNextNonspace();
        else return 1;
        return 0;
      },
      finalize: (_p, block) => {
        if (block.fenced) {
          const nl = block.content.indexOf('\n');
          block.info = unescapeString(block.content.slice(0, nl).trim());
          block.literal = block.content.slice(nl + 1);
        } else {
          const lines = block.content.split('\n');
          while (lines.length && /^[ \t]*$/.test(lines.at(-1)!)) lines.pop();
          block.literal = `${lines.join('\n')}\n`;
          block.endLine = block.line + lines.length - 1;
        }
        block.content = '';
      },
      acceptsLines: true,
    },
    math_block: {
      ...leaf,
      continue: (p, c) => {
        if (p.indent <= 3 && reMathFence.test(p.currentLine.slice(p.nextNonspace))) {
          p.finalize(c, p.lineNumber);
          return 2;
        }
        return 0;
      },
      finalize: (_p, block) => {
        // The opening line's (empty) rest comes first.
        block.literal = block.content.slice(block.content.indexOf('\n') + 1);
        block.content = '';
      },
      acceptsLines: true,
    },
    html_block: {
      ...leaf,
      continue: (p, c) => (p.blank && (c.htmlBlockType === 6 || c.htmlBlockType === 7) ? 1 : 0),
      finalize: (_p, block) => {
        block.literal = block.content.replace(/(\n *)+$/, '');
        block.content = '';
      },
      acceptsLines: true,
    },
    paragraph: {
      ...leaf,
      continue: (p) => (p.blank ? 1 : 0),
      finalize: (p, block) => {
        let pos: number;
        let refs = false;
        while (block.content[0] === '[' && (pos = p.inline.parseReference(block.content))) {
          block.content = block.content.slice(pos);
          refs = true;
        }
        if (refs && isBlank(block.content)) {
          block.unlink();
          return;
        }
        if (p.extras) {
          // A table of contents where a paragraph is only [[toc]] or [TOC].
          if (/^\s*(?:\[\[toc\]\]|\[toc\])\s*$/i.test(block.content)) {
            block.type = 'toc';
            block.content = '';
            return;
          }
          // A GitHub alert: a block quote whose first line is [!NOTE], [!TIP], [!IMPORTANT], [!WARNING] or [!CAUTION].
          const quote = block.parent;
          const m = quote?.type === 'block_quote' && quote.firstChild === block ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i.exec(block.content) : null;
          if (m) {
            quote!.alert = m[1]!.toUpperCase();
            block.content = block.content.slice(m[0].length);
            if (isBlank(block.content)) {
              block.unlink();
              return;
            }
          }
        }
        // A task list item: its first paragraph starts with [ ] or [x] (GFM).
        const item = block.parent;
        if (p.gfm && item?.type === 'item' && item.firstChild === block) {
          const m = /^\[([ xX])\](?:[ \t]+|(?=\n|$))/.exec(block.content);
          if (m && block.content.slice(m[0].length).trim()) {
            item.checked = m[1] !== ' ';
            block.content = block.content.slice(m[0].length);
          }
        }
      },
      acceptsLines: true,
    },
    table: {
      ...leaf,
      continue: (p) => (p.blank ? 1 : 0),
      finalize: (_p, block) => {
        const width = block.align.length;
        block.rows.forEach((line, i) => {
          const row = Object.assign(new MdNode('table_row', block.line + i), { header: i === 0 });
          const cells = splitRow(line);
          for (let c = 0; c < width; c++) row.appendChild(Object.assign(new MdNode('table_cell'), { content: cells[c] ?? '', align: [block.align[c] ?? null] }));
          block.appendChild(row);
        });
      },
      acceptsLines: true,
    },
  };

  private readonly starts: ((p: BlockParser, container: MdNode) => 0 | 1 | 2)[] = [
    // Block quote.
    (p) => {
      if (p.indented || p.currentLine[p.nextNonspace] !== '>') return 0;
      p.advanceNextNonspace();
      p.advanceOffset(1, false);
      if (isSpaceOrTab(p.currentLine[p.offset])) p.advanceOffset(1, true);
      p.closeUnmatchedBlocks();
      p.addChild('block_quote');
      return 1;
    },
    // ATX heading.
    (p) => {
      const m = p.indented ? null : reATXHeadingMarker.exec(p.currentLine.slice(p.nextNonspace));
      if (!m) return 0;
      p.advanceNextNonspace();
      p.advanceOffset(m[0].length, false);
      p.closeUnmatchedBlocks();
      const h = p.addChild('heading');
      h.level = m[0].trim().length;
      h.content = p.currentLine
        .slice(p.offset)
        .replace(/^[ \t]*#+[ \t]*$/, '')
        .replace(/[ \t]+#+[ \t]*$/, '');
      p.advanceOffset(p.currentLine.length - p.offset, false);
      return 2;
    },
    // Fenced code.
    (p) => {
      const m = p.indented ? null : reCodeFence.exec(p.currentLine.slice(p.nextNonspace));
      if (!m) return 0;
      p.closeUnmatchedBlocks();
      const c = p.addChild('code_block');
      Object.assign(c, { fenced: true, fenceLength: m[0].length, fenceChar: m[0][0], fenceOffset: p.indent });
      p.advanceNextNonspace();
      p.advanceOffset(m[0].length, false);
      return 2;
    },
    // Math block, `$$` on its own line (extras).
    (p) => {
      if (!p.extras || p.indented || !reMathFence.test(p.currentLine.slice(p.nextNonspace))) return 0;
      p.closeUnmatchedBlocks();
      p.addChild('math_block');
      p.advanceOffset(p.currentLine.length - p.offset, false);
      return 2;
    },
    // HTML block.
    (p, container) => {
      if (p.indented || p.currentLine[p.nextNonspace] !== '<') return 0;
      const s = p.currentLine.slice(p.nextNonspace);
      for (let t = 1; t <= 7; t++)
        if (reHtmlBlockOpen[t]!.test(s) && (t < 7 || (container.type !== 'paragraph' && !(!p.allClosed && !p.blank && p.tip.type === 'paragraph')))) {
          p.closeUnmatchedBlocks();
          p.addChild('html_block').htmlBlockType = t;
          return 2;
        }
      return 0;
    },
    // Table: a delimiter row under a paragraph line with as many cells (GFM).
    (p, container) => {
      if (!p.gfm || p.indented || container.type !== 'paragraph' || p.tip !== container) return 0;
      const lines = container.content.replace(/\n$/, '').split('\n');
      const header = lines.at(-1)!;
      const delimiter = p.currentLine.slice(p.nextNonspace);
      const align = delimiterRow(delimiter);
      if (!align || (!header.includes('|') && !delimiter.includes('|')) || splitRow(header).length !== align.length) return 0;
      p.closeUnmatchedBlocks();
      const parent = container.parent!;
      const table = Object.assign(new MdNode('table', p.lineNumber - 1), { align, rows: [header] });
      if (lines.length > 1) {
        container.content = `${lines.slice(0, -1).join('\n')}\n`;
        p.finalize(container, p.lineNumber - 2);
      } else container.unlink();
      parent.appendChild(table);
      p.tip = table;
      p.advanceOffset(p.currentLine.length - p.offset, false);
      return 2;
    },
    // Setext heading.
    (p, container) => {
      const m = !p.indented && container.type === 'paragraph' ? reSetextHeadingLine.exec(p.currentLine.slice(p.nextNonspace)) : null;
      if (!m) return 0;
      p.closeUnmatchedBlocks();
      let pos: number;
      while (container.content[0] === '[' && (pos = p.inline.parseReference(container.content))) container.content = container.content.slice(pos);
      if (!container.content.length) return 0;
      const h = new MdNode('heading', container.line);
      h.level = m[0][0] === '=' ? 1 : 2;
      h.content = container.content;
      container.insertAfter(h);
      container.unlink();
      p.tip = h;
      p.advanceOffset(p.currentLine.length - p.offset, false);
      return 2;
    },
    // Thematic break.
    (p) => {
      if (p.indented || !reThematicBreak.test(p.currentLine.slice(p.nextNonspace))) return 0;
      p.closeUnmatchedBlocks();
      p.addChild('thematic_break');
      p.advanceOffset(p.currentLine.length - p.offset, false);
      return 2;
    },
    // Footnote definition `[^label]:` (GFM); it does not interrupt a paragraph.
    (p, container) => {
      if (!p.gfm || p.indented || container.type === 'paragraph') return 0;
      const m = reFootnoteDef.exec(p.currentLine.slice(p.nextNonspace));
      if (!m) return 0;
      p.advanceNextNonspace();
      p.advanceOffset(m[0].length, false);
      p.closeUnmatchedBlocks();
      const def = p.addChild('footnote_definition');
      def.label = normalizeLabel(`[${m[1]!}]`);
      def.literal = m[1]!;
      if (!p.inline.footnotes.has(def.label)) p.inline.footnotes.set(def.label, def);
      return 1;
    },
    // List item.
    (p, container) => {
      if (p.indented && container.type !== 'list') return 0;
      const data = parseListMarker(p, container);
      if (!data) return 0;
      p.closeUnmatchedBlocks();
      if (p.tip.type !== 'list' || !listsMatch(container.listData, data)) p.addChild('list').listData = data;
      p.addChild('item').listData = data;
      return 1;
    },
    // Indented code.
    (p) => {
      if (!p.indented || p.tip.type === 'paragraph' || p.blank) return 0;
      p.advanceOffset(CODE_INDENT, true);
      p.closeUnmatchedBlocks();
      p.addChild('code_block');
      return 2;
    },
  ];

  addLine(): void {
    if (this.partiallyConsumedTab) {
      this.offset += 1;
      this.tip.content += ' '.repeat(4 - (this.column % 4));
    }
    if (this.tip.type === 'table') {
      const row = this.currentLine.slice(this.offset);
      if (row.trim()) this.tip.rows.push(row);
      return;
    }
    this.tip.content += `${this.currentLine.slice(this.offset)}\n`;
  }

  addChild(type: NodeType): MdNode {
    while (!this.blocks[this.tip.type]!.canContain(type)) this.finalize(this.tip, this.lineNumber - 1);
    const block = new MdNode(type, this.lineNumber);
    this.tip.appendChild(block);
    this.tip = block;
    return block;
  }

  closeUnmatchedBlocks(): void {
    if (this.allClosed) return;
    while (this.oldtip !== this.lastMatchedContainer) {
      const parent = this.oldtip.parent!;
      this.finalize(this.oldtip, this.lineNumber - 1);
      this.oldtip = parent;
    }
    this.allClosed = true;
  }

  findNextNonspace(): void {
    const ln = this.currentLine;
    let i = this.offset;
    let cols = this.column;
    let c: string | undefined;
    while ((c = ln[i]) !== undefined) {
      if (c === ' ') {
        i++;
        cols++;
      } else if (c === '\t') {
        i++;
        cols += 4 - (cols % 4);
      } else break;
    }
    this.blank = c === undefined || c === '\n' || c === '\r';
    this.nextNonspace = i;
    this.nextNonspaceColumn = cols;
    this.indent = cols - this.column;
    this.indented = this.indent >= CODE_INDENT;
  }

  advanceNextNonspace(): void {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partiallyConsumedTab = false;
  }

  advanceOffset(count: number, columns: boolean): void {
    const ln = this.currentLine;
    let c: string | undefined;
    while (count > 0 && (c = ln[this.offset]) !== undefined) {
      if (c === '\t') {
        const toTab = 4 - (this.column % 4);
        if (columns) {
          this.partiallyConsumedTab = toTab > count;
          const step = Math.min(toTab, count);
          this.column += step;
          this.offset += this.partiallyConsumedTab ? 0 : 1;
          count -= step;
        } else {
          this.partiallyConsumedTab = false;
          this.column += toTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partiallyConsumedTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  }

  finalize(block: MdNode, lineNumber: number): void {
    const above = block.parent;
    block.open = false;
    block.endLine = lineNumber;
    this.blocks[block.type]!.finalize(this, block);
    this.tip = above!;
  }

  private incorporateLine(line: string): void {
    let allMatched = true;
    let container = this.doc;
    this.oldtip = this.tip;
    this.offset = 0;
    this.column = 0;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.lineNumber += 1;
    this.currentLine = line.includes('\u0000') ? line.replace(/\0/g, '�') : line;

    let last: MdNode | null;
    while ((last = container.lastChild) && last.open) {
      container = last;
      this.findNextNonspace();
      const r = this.blocks[container.type]!.continue(this, container);
      if (r === 2) return;
      if (r === 1) {
        allMatched = false;
        container = container.parent!;
        break;
      }
    }
    void allMatched;
    this.allClosed = container === this.oldtip;
    this.lastMatchedContainer = container;

    let matchedLeaf = container.type !== 'paragraph' && container.type !== 'table' && this.blocks[container.type]!.acceptsLines;
    while (!matchedLeaf) {
      this.findNextNonspace();
      if (!this.indented && !reMaybeSpecial.test(this.currentLine.slice(this.nextNonspace))) {
        this.advanceNextNonspace();
        break;
      }
      let i = 0;
      for (; i < this.starts.length; i++) {
        const r = this.starts[i]!(this, container);
        if (r === 1) {
          container = this.tip;
          break;
        }
        if (r === 2) {
          container = this.tip;
          matchedLeaf = true;
          break;
        }
      }
      if (i === this.starts.length) {
        this.advanceNextNonspace();
        break;
      }
    }

    if (!this.allClosed && !this.blank && this.tip.type === 'paragraph') {
      // Lazy paragraph continuation.
      this.addLine();
    } else {
      this.closeUnmatchedBlocks();
      const t = container.type;
      if (this.blocks[t]!.acceptsLines) {
        this.addLine();
        if (t === 'html_block' && container.htmlBlockType >= 1 && container.htmlBlockType <= 5 && reHtmlBlockClose[container.htmlBlockType]!.test(this.currentLine.slice(this.offset))) {
          this.lastLineLength = line.length;
          this.finalize(container, this.lineNumber);
        }
      } else if (this.offset < line.length && !this.blank) {
        this.addChild('paragraph');
        this.advanceNextNonspace();
        this.addLine();
      }
    }
    this.lastLineLength = line.length;
  }

  /** Parse a whole document. */
  parse(input: string): MdNode {
    let text = input;
    // Front matter (extras): a block of `key: value` lines between `---` lines at the very start.
    if (this.extras) {
      const fm = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
      if (fm) {
        const node = Object.assign(new MdNode('front_matter', 1), { literal: fm[1]!, open: false });
        this.doc.appendChild(node);
        const skipped = fm[0].split(reLineEnding).length - 1;
        text = text.slice(fm[0].length);
        this.lineNumber = skipped;
      }
    }
    const lines = text.split(reLineEnding);
    let len = lines.length;
    if (text.endsWith('\n') || text.endsWith('\r')) len -= 1;
    for (let i = 0; i < len; i++) this.incorporateLine(lines[i]!);
    while (this.tip && this.tip !== this.doc.parent) {
      const t = this.tip;
      this.finalize(t, this.lineNumber);
      if (t === this.doc) break;
    }
    this.processInlines(this.doc);
    if (this.gfm) numberFootnotes(this.doc, this.inline.footnotes);
    return this.doc;
  }

  private processInlines(block: MdNode): void {
    for (const c of [...block.children()]) {
      if (c.type === 'paragraph' || c.type === 'heading' || c.type === 'table_cell') this.inline.parse(c);
      else if (c.firstChild) this.processInlines(c);
    }
  }
}

/** Whether there is a blank line between a block and the next. */
const endsWithBlankLine = (block: MdNode) => !!block.next && block.endLine !== block.next.line - 1;

function parseListMarker(p: BlockParser, container: MdNode): ListData | null {
  const rest = p.currentLine.slice(p.nextNonspace);
  if (p.indent >= 4) return null;
  let m: RegExpExecArray | null;
  let data: ListData;
  if ((m = reBulletListMarker.exec(rest))) data = { type: 'bullet', tight: true, bulletChar: m[0][0], padding: 0, markerOffset: p.indent };
  else if ((m = reOrderedListMarker.exec(rest)) && (container.type !== 'paragraph' || m[1] === '1')) data = { type: 'ordered', tight: true, start: parseInt(m[1]!, 10), delimiter: m[2] as '.' | ')', padding: 0, markerOffset: p.indent };
  else return null;
  const next = p.currentLine[p.nextNonspace + m[0].length];
  if (!(next === undefined || next === '\t' || next === ' ')) return null;
  // An item interrupting a paragraph needs content on its first line.
  if (container.type === 'paragraph' && !reNonSpace.test(p.currentLine.slice(p.nextNonspace + m[0].length))) return null;
  p.advanceNextNonspace();
  p.advanceOffset(m[0].length, true);
  const startCol = p.column;
  const startOffset = p.offset;
  do p.advanceOffset(1, true);
  while (p.column - startCol < 5 && isSpaceOrTab(p.currentLine[p.offset]));
  const blankItem = p.currentLine[p.offset] === undefined;
  const spaces = p.column - startCol;
  if (spaces >= 5 || spaces < 1 || blankItem) {
    data.padding = m[0].length + 1;
    p.column = startCol;
    p.offset = startOffset;
    if (isSpaceOrTab(p.currentLine[p.offset])) p.advanceOffset(1, true);
  } else data.padding = m[0].length + spaces;
  return data;
}

const listsMatch = (a: ListData, b: ListData) => a.type === b.type && a.delimiter === b.delimiter && a.bulletChar === b.bulletChar;

/** Cells of a table row: outer pipes dropped, split at unescaped pipes, `\|` kept as a pipe. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += s[i];
  }
  cells.push(cell.trim());
  return cells;
}

/** Column alignments of a table delimiter row, or null when it is not one. */
function delimiterRow(line: string): Align[] | null {
  const cells = splitRow(line);
  if (!cells.length) return null;
  const out: Align[] = [];
  for (const c of cells) {
    if (!/^:?-+:?$/.test(c)) return null;
    out.push(c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null);
  }
  return out;
}

/** Number footnotes by first reference, in document order; each reference knows which repeat it is (GFM). */
function numberFootnotes(doc: MdNode, defs: Map<string, MdNode>): void {
  let next = 1;
  const walk = (n: MdNode) => {
    for (const c of n.children()) {
      if (c.type === 'footnote_definition') continue;
      if (c.type === 'footnote_ref') {
        const def = defs.get(c.label)!;
        if (!def.index) def.index = next++;
        def.refIndex += 1;
        c.index = def.index;
        c.refIndex = def.refIndex;
        c.literal = def.literal;
      } else walk(c);
    }
  };
  walk(doc);
  // Footnotes referenced only from other footnotes, in order of their definitions.
  for (const def of defs.values()) if (def.index) walk(def);
}

/** Parse Markdown into a tree. */
export const parseMarkdown = (text: string, options: MarkdownOptions = {}) => new BlockParser(options).parse(text);
