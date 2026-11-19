/** Kinds of Markdown node (URS-WS-040): CommonMark blocks and inlines, GFM extensions, and the viewer's extras. */
export type NodeType =
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'thematic_break'
  | 'block_quote'
  | 'list'
  | 'item'
  | 'code_block'
  | 'html_block'
  | 'table'
  | 'table_row'
  | 'table_cell'
  | 'footnote_definition'
  | 'math_block'
  | 'front_matter'
  | 'toc'
  | 'text'
  | 'softbreak'
  | 'linebreak'
  | 'emph'
  | 'strong'
  | 'strikethrough'
  | 'code'
  | 'html_inline'
  | 'link'
  | 'image'
  | 'footnote_ref'
  | 'math_inline';

export type Align = 'left' | 'center' | 'right' | null;

/** List data, from the marker that opened it. */
export interface ListData {
  type: 'bullet' | 'ordered';
  tight: boolean;
  bulletChar?: string;
  start?: number;
  delimiter?: '.' | ')';
  padding: number;
  markerOffset: number;
}

/**
 * A node of the Markdown tree. Siblings are linked, as the CommonMark reference parser does, because emphasis
 * and links are resolved by moving nodes between delimiters.
 */
export class MdNode {
  type: NodeType;
  parent: MdNode | null = null;
  firstChild: MdNode | null = null;
  lastChild: MdNode | null = null;
  prev: MdNode | null = null;
  next: MdNode | null = null;
  /** Source line where a block starts (1-based) and ends. */
  line = 0;
  endLine = 0;
  open = true;
  lastLineBlank = false;
  lastLineChecked = false;
  /** Text: text, code, html, code block content. */
  literal = '';
  /** Lines of a block still being read. */
  content = '';
  level = 0;
  destination = '';
  title = '';
  info = '';
  fenced = false;
  fenceChar = '';
  fenceLength = 0;
  fenceOffset = 0;
  htmlBlockType = 0;
  listData: ListData = { type: 'bullet', tight: true, padding: 0, markerOffset: 0 };
  /** Task list item: whether it is checked; undefined for an ordinary item. */
  checked: boolean | undefined = undefined;
  /** Table: column alignments; a row: whether it is the header. */
  align: Align[] = [];
  header = false;
  /** Footnotes: the label, its number, and which reference this is (1, 2… for repeats). */
  label = '';
  index = 0;
  refIndex = 0;
  /** GitHub alert kind of a block quote, e.g. NOTE. */
  alert = '';
  /** Table rows waiting to be parsed into cells. */
  rows: string[] = [];

  constructor(type: NodeType, line = 0) {
    this.type = type;
    this.line = line;
  }

  appendChild(child: MdNode): void {
    child.unlink();
    child.parent = this;
    if (this.lastChild) {
      this.lastChild.next = child;
      child.prev = this.lastChild;
      this.lastChild = child;
    } else {
      this.firstChild = this.lastChild = child;
    }
  }

  prependChild(child: MdNode): void {
    child.unlink();
    child.parent = this;
    if (this.firstChild) {
      this.firstChild.prev = child;
      child.next = this.firstChild;
      this.firstChild = child;
    } else {
      this.firstChild = this.lastChild = child;
    }
  }

  insertAfter(sibling: MdNode): void {
    sibling.unlink();
    sibling.next = this.next;
    if (sibling.next) sibling.next.prev = sibling;
    sibling.prev = this;
    this.next = sibling;
    sibling.parent = this.parent;
    if (!sibling.next && sibling.parent) sibling.parent.lastChild = sibling;
  }

  insertBefore(sibling: MdNode): void {
    sibling.unlink();
    sibling.prev = this.prev;
    if (sibling.prev) sibling.prev.next = sibling;
    sibling.next = this;
    this.prev = sibling;
    sibling.parent = this.parent;
    if (!sibling.prev && sibling.parent) sibling.parent.firstChild = sibling;
  }

  unlink(): void {
    if (this.prev) this.prev.next = this.next;
    else if (this.parent) this.parent.firstChild = this.next;
    if (this.next) this.next.prev = this.prev;
    else if (this.parent) this.parent.lastChild = this.prev;
    this.parent = this.next = this.prev = null;
  }

  /** Children in order. */
  *children(): Generator<MdNode> {
    for (let c = this.firstChild; c; c = c.next) yield c;
  }

  get isContainer(): boolean {
    return CONTAINERS.has(this.type);
  }
}

const CONTAINERS = new Set<NodeType>(['document', 'block_quote', 'list', 'item', 'paragraph', 'heading', 'emph', 'strong', 'strikethrough', 'link', 'image', 'table', 'table_row', 'table_cell', 'footnote_definition']);

/** Plain text of a node's inlines, e.g. for image alt text and heading slugs. */
export function plainText(node: MdNode): string {
  let out = '';
  for (const c of node.children()) {
    if (c.type === 'text' || c.type === 'code' || c.type === 'math_inline') out += c.literal;
    else if (c.type === 'softbreak' || c.type === 'linebreak') out += '\n';
    else out += plainText(c);
  }
  return out;
}
