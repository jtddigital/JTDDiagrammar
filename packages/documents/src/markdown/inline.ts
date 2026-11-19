import { decodeEntity, ESCAPABLE, normalizeLabel, normalizeURI, rePunctuation, reHtmlTag, reUnicodeWhitespace, unescapeString } from './common.ts';
import { MdNode } from './node.ts';

/** What a link reference definition says. */
export interface Ref {
  destination: string;
  title: string;
}

export interface InlineOptions {
  /** GFM: strikethrough, extended autolinks, footnote references. */
  gfm: boolean;
  /** `$…$` math (the viewer's extra, URS-WS-041). */
  math: boolean;
}

const ESCAPED_CHAR = `\\\\${ESCAPABLE}`;
const reLinkTitle = new RegExp(
  `^(?:"(${ESCAPED_CHAR}|\\\\[^\\\\]|[^\\\\"\\x00])*"` + `|'(${ESCAPED_CHAR}|\\\\[^\\\\]|[^\\\\'\\x00])*'` + `|\\((${ESCAPED_CHAR}|\\\\[^\\\\]|[^\\\\()\\x00])*\\))`,
);
const reLinkDestinationBraces = /^(?:<(?:[^<>\n\\\x00]|\\.)*>)/;
const reEscapable = new RegExp(`^${ESCAPABLE}`);
const reEntityHere = /^&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/i;
const reTicks = /`+/;
const reTicksHere = /^`+/;
const reEmailAutolink = /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
const reAutolink = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/i;
const reSpnl = /^ *(?:\n *)?/;
const reWhitespaceChar = /^[ \t\n\x0b\x0c\x0d]/;
const reFinalSpace = / *$/;
const reInitialSpace = /^ */;
const reSpaceAtEndOfLine = /^ *(?:\n|$)/;
const reLinkLabel = /^\[(?:[^\\[\]]|\\.){0,1000}\]/s;
const reMain = /^[^\n`[\]\\!<&*_]+/m;
const reMainGfm = /^[^\n`[\]\\!<&*_~]+/m;
const reMainMath = /^[^\n`[\]\\!<&*_~$]+/m;

const text = (s: string) => Object.assign(new MdNode('text'), { literal: s });

interface Delimiter {
  cc: string;
  numdelims: number;
  origdelims: number;
  node: MdNode;
  previous: Delimiter | null;
  next: Delimiter | null;
  canOpen: boolean;
  canClose: boolean;
}

interface Bracket {
  node: MdNode;
  previous: Bracket | null;
  previousDelimiter: Delimiter | null;
  index: number;
  image: boolean;
  active: boolean;
  bracketAfter?: boolean;
}

/**
 * The inline parser of the CommonMark reference implementation (commonmark.js), in TypeScript: a delimiter
 * stack for emphasis, a bracket stack for links and images. GFM adds strikethrough with `~`, footnote
 * references `[^label]` and extended autolinks (www., http(s)://, e-mail addresses in text).
 */
export class InlineParser {
  private subject = '';
  private pos = 0;
  private delimiters: Delimiter | null = null;
  private brackets: Bracket | null = null;
  refmap: Map<string, Ref> = new Map();
  /** Footnote definitions by normalised label. */
  footnotes: Map<string, MdNode> = new Map();
  private readonly options: InlineOptions;

  constructor(options: InlineOptions) {
    this.options = options;
  }

  private match(re: RegExp): string | null {
    const m = re.exec(this.subject.slice(this.pos));
    if (m === null) return null;
    this.pos += m.index + m[0].length;
    return m[0];
  }

  private peek(): string | undefined {
    return this.pos < this.subject.length ? this.subject[this.pos] : undefined;
  }

  private spnl(): true {
    this.match(reSpnl);
    return true;
  }

  private parseBackticks(block: MdNode): boolean {
    const ticks = this.match(reTicksHere);
    if (ticks === null) return false;
    const after = this.pos;
    let matched: string | null;
    while ((matched = this.match(reTicks)) !== null) {
      if (matched === ticks) {
        const node = new MdNode('code');
        const contents = this.subject.slice(after, this.pos - ticks.length).replace(/\n/g, ' ');
        node.literal = contents.length > 0 && /[^ ]/.test(contents) && contents[0] === ' ' && contents.at(-1) === ' ' ? contents.slice(1, -1) : contents;
        block.appendChild(node);
        return true;
      }
    }
    this.pos = after;
    block.appendChild(text(ticks));
    return true;
  }

  private parseBackslash(block: MdNode): boolean {
    this.pos += 1;
    if (this.peek() === '\n') {
      this.pos += 1;
      block.appendChild(new MdNode('linebreak'));
    } else if (reEscapable.test(this.subject.charAt(this.pos))) {
      block.appendChild(text(this.subject.charAt(this.pos)));
      this.pos += 1;
    } else block.appendChild(text('\\'));
    return true;
  }

  private parseAutolink(block: MdNode): boolean {
    let m = this.match(reEmailAutolink);
    let dest: string;
    if (m) {
      dest = m.slice(1, -1);
      const node = Object.assign(new MdNode('link'), { destination: normalizeURI(`mailto:${dest}`) });
      node.appendChild(text(dest));
      block.appendChild(node);
      return true;
    }
    if ((m = this.match(reAutolink))) {
      dest = m.slice(1, -1);
      const node = Object.assign(new MdNode('link'), { destination: normalizeURI(dest) });
      node.appendChild(text(dest));
      block.appendChild(node);
      return true;
    }
    return false;
  }

  private parseHtmlTag(block: MdNode): boolean {
    const m = this.match(reHtmlTag);
    if (m === null) return false;
    block.appendChild(Object.assign(new MdNode('html_inline'), { literal: m }));
    return true;
  }

  /** The character before `pos`, whole when it is outside the basic plane. */
  private charBefore(at: number): string {
    if (at === 0) return '\n';
    const low = this.subject.charCodeAt(at - 1);
    return low >= 0xdc00 && low <= 0xdfff && at >= 2 ? this.subject.slice(at - 2, at) : this.subject.charAt(at - 1);
  }

  private scanDelims(cc: string): { numdelims: number; canOpen: boolean; canClose: boolean } | null {
    let numdelims = 0;
    const start = this.pos;
    while (this.peek() === cc) {
      numdelims++;
      this.pos++;
    }
    if (numdelims === 0) return null;
    const before = this.charBefore(start);
    const after = this.pos < this.subject.length ? String.fromCodePoint(this.subject.codePointAt(this.pos)!) : '\n';
    const afterSpace = reUnicodeWhitespace.test(after);
    const afterPunct = rePunctuation.test(after);
    const beforeSpace = reUnicodeWhitespace.test(before);
    const beforePunct = rePunctuation.test(before);
    const left = !afterSpace && (!afterPunct || beforeSpace || beforePunct);
    const right = !beforeSpace && (!beforePunct || afterSpace || afterPunct);
    let canOpen: boolean, canClose: boolean;
    if (cc === '_') {
      canOpen = left && (!right || beforePunct);
      canClose = right && (!left || afterPunct);
    } else {
      canOpen = left;
      canClose = right;
    }
    this.pos = start;
    return { numdelims, canOpen, canClose };
  }

  private handleDelim(cc: string, block: MdNode): boolean {
    const res = this.scanDelims(cc);
    if (!res) return false;
    const start = this.pos;
    this.pos += res.numdelims;
    const node = text(this.subject.slice(start, this.pos));
    block.appendChild(node);
    // More than two tildes never strike through.
    if ((res.canOpen || res.canClose) && !(cc === '~' && res.numdelims > 2)) {
      this.delimiters = { cc, numdelims: res.numdelims, origdelims: res.numdelims, node, previous: this.delimiters, next: null, canOpen: res.canOpen, canClose: res.canClose };
      if (this.delimiters.previous) this.delimiters.previous.next = this.delimiters;
    }
    return true;
  }

  private removeDelimiter(d: Delimiter): void {
    if (d.previous) d.previous.next = d.next;
    if (d.next) d.next.previous = d.previous;
    else this.delimiters = d.previous;
  }

  private processEmphasis(bottom: Delimiter | null): void {
    const openersBottom: (Delimiter | null)[] = Array(16).fill(bottom);
    let closer = this.delimiters;
    while (closer !== null && closer.previous !== bottom) closer = closer.previous;
    while (closer !== null) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const cc = closer.cc;
      const bi = cc === '~' ? 14 + (closer.canOpen ? 1 : 0) : (cc === '_' ? 2 : 8) + (closer.canOpen ? 3 : 0) + (closer.origdelims % 3);
      let opener = closer.previous;
      let found = false;
      while (opener !== null && opener !== bottom && opener !== openersBottom[bi]) {
        if (cc === '~') {
          if (opener.cc === '~' && opener.canOpen && opener.numdelims === closer.numdelims) {
            found = true;
            break;
          }
        } else {
          const odd = (closer.canOpen || opener.canClose) && closer.origdelims % 3 !== 0 && (opener.origdelims + closer.origdelims) % 3 === 0;
          if (opener.cc === cc && opener.canOpen && !odd) {
            found = true;
            break;
          }
        }
        opener = opener.previous;
      }
      const oldCloser = closer;
      if (found && opener) {
        const use = cc === '~' ? closer.numdelims : closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1;
        const openerInl = opener.node;
        const closerInl = closer.node;
        opener.numdelims -= use;
        closer.numdelims -= use;
        openerInl.literal = openerInl.literal.slice(0, openerInl.literal.length - use);
        closerInl.literal = closerInl.literal.slice(0, closerInl.literal.length - use);
        const wrap = new MdNode(cc === '~' ? 'strikethrough' : use === 1 ? 'emph' : 'strong');
        for (let tmp = openerInl.next; tmp && tmp !== closerInl; ) {
          const next = tmp.next;
          wrap.appendChild(tmp);
          tmp = next;
        }
        openerInl.insertAfter(wrap);
        // Delimiters between them are gone.
        if (opener.next !== closer) {
          opener.next = closer;
          closer.previous = opener;
        }
        if (opener.numdelims === 0) {
          openerInl.unlink();
          this.removeDelimiter(opener);
        }
        if (closer.numdelims === 0) {
          closerInl.unlink();
          const next = closer.next;
          this.removeDelimiter(closer);
          closer = next;
        }
      } else {
        closer = closer.next;
      }
      if (!found) {
        openersBottom[bi] = oldCloser.previous;
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser);
      }
    }
    while (this.delimiters !== null && this.delimiters !== bottom) this.removeDelimiter(this.delimiters);
  }

  private parseLinkTitle(): string | null {
    const title = this.match(reLinkTitle);
    return title === null ? null : unescapeString(title.slice(1, -1));
  }

  private parseLinkDestination(): string | null {
    const res = this.match(reLinkDestinationBraces);
    if (res !== null) return normalizeURI(unescapeString(res.slice(1, -1)));
    if (this.peek() === '<') return null;
    const start = this.pos;
    let parens = 0;
    let c: string | undefined;
    while ((c = this.peek()) !== undefined) {
      if (c === '\\' && reEscapable.test(this.subject.charAt(this.pos + 1))) {
        this.pos += 1;
        if (this.peek() !== undefined) this.pos += 1;
      } else if (c === '(') {
        this.pos += 1;
        parens += 1;
      } else if (c === ')') {
        if (parens < 1) break;
        this.pos += 1;
        parens -= 1;
      } else if (reWhitespaceChar.test(c)) break;
      else if (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f) break;
      else this.pos += 1;
    }
    if (this.pos === start && c !== ')') return null;
    if (parens !== 0) return null;
    return normalizeURI(unescapeString(this.subject.slice(start, this.pos)));
  }

  private parseLinkLabel(): number {
    const m = this.match(reLinkLabel);
    return m === null || m.length > 1001 ? 0 : m.length;
  }

  private parseOpenBracket(block: MdNode): boolean {
    const start = this.pos;
    this.pos += 1;
    const node = text('[');
    block.appendChild(node);
    this.addBracket(node, start, false);
    return true;
  }

  private parseBang(block: MdNode): boolean {
    const start = this.pos;
    this.pos += 1;
    if (this.peek() === '[') {
      this.pos += 1;
      const node = text('![');
      block.appendChild(node);
      this.addBracket(node, start + 1, true);
    } else block.appendChild(text('!'));
    return true;
  }

  private addBracket(node: MdNode, index: number, image: boolean): void {
    if (this.brackets !== null) this.brackets.bracketAfter = true;
    this.brackets = { node, previous: this.brackets, previousDelimiter: this.delimiters, index, image, active: true };
  }

  private parseCloseBracket(block: MdNode): boolean {
    this.pos += 1;
    const start = this.pos;
    const opener = this.brackets;
    if (opener === null) {
      block.appendChild(text(']'));
      return true;
    }
    if (!opener.active) {
      block.appendChild(text(']'));
      this.brackets = opener.previous;
      return true;
    }
    const isImage = opener.image;
    const save = this.pos;
    let dest: string | null = null;
    let title: string | null = null;
    let matched = false;
    if (this.peek() === '(') {
      this.pos++;
      if (this.spnl() && (dest = this.parseLinkDestination()) !== null && this.spnl() && ((reWhitespaceChar.test(this.subject.charAt(this.pos - 1)) && (title = this.parseLinkTitle())) || true) && this.spnl() && this.peek() === ')') {
        this.pos += 1;
        matched = true;
      } else this.pos = save;
    }
    let reflabel: string | undefined;
    if (!matched) {
      const before = this.pos;
      const n = this.parseLinkLabel();
      if (n > 2) reflabel = this.subject.slice(before, before + n);
      else if (!opener.bracketAfter) reflabel = this.subject.slice(opener.index, start);
      if (n === 0) this.pos = save;
      // A footnote reference: [^label] naming a footnote definition (GFM).
      const own = this.subject.slice(opener.index, start);
      if (this.options.gfm && n === 0 && own.startsWith('[^') && this.footnotes.has(normalizeLabel(own.replace(/^\[\^/, '[')))) {
        const ref = Object.assign(new MdNode('footnote_ref'), { label: normalizeLabel(own.replace(/^\[\^/, '[')) });
        while (opener.node.next) opener.node.next.unlink();
        if (isImage) opener.node.insertBefore(text('!'));
        opener.node.insertAfter(ref);
        opener.node.unlink();
        this.brackets = opener.previous;
        this.processEmphasis(opener.previousDelimiter);
        return true;
      }
      if (reflabel) {
        const link = this.refmap.get(normalizeLabel(reflabel));
        if (link) {
          dest = link.destination;
          title = link.title;
          matched = true;
        }
      }
    }
    if (!matched) {
      this.brackets = opener.previous;
      this.pos = start;
      block.appendChild(text(']'));
      return true;
    }
    const node = Object.assign(new MdNode(isImage ? 'image' : 'link'), { destination: dest ?? '', title: title ?? '' });
    for (let tmp = opener.node.next; tmp; ) {
      const next = tmp.next;
      node.appendChild(tmp);
      tmp = next;
    }
    block.appendChild(node);
    this.processEmphasis(opener.previousDelimiter);
    this.brackets = opener.previous;
    opener.node.unlink();
    // No links in links: earlier link openers become inactive.
    if (!isImage) for (let o = this.brackets; o; o = o.previous) if (!o.image) o.active = false;
    return true;
  }

  private parseEntity(block: MdNode): boolean {
    const m = this.match(reEntityHere);
    if (m === null) return false;
    block.appendChild(text(decodeEntity(m)));
    return true;
  }

  private parseString(block: MdNode): boolean {
    const m = this.match(this.options.math ? reMainMath : this.options.gfm ? reMainGfm : reMain);
    if (m === null) return false;
    block.appendChild(text(m));
    return true;
  }

  private parseNewline(block: MdNode): boolean {
    this.pos += 1;
    const last = block.lastChild;
    if (last && last.type === 'text' && last.literal.endsWith(' ')) {
      const hard = last.literal.at(-2) === ' ';
      last.literal = last.literal.replace(reFinalSpace, '');
      block.appendChild(new MdNode(hard ? 'linebreak' : 'softbreak'));
    } else block.appendChild(new MdNode('softbreak'));
    this.match(reInitialSpace);
    return true;
  }

  /** `$…$` inline math: no space just inside, and a closing `$` not followed by a digit. */
  private parseMath(block: MdNode): boolean {
    const m = /^\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(this.subject.slice(this.pos));
    if (!m) return false;
    this.pos += m[0].length;
    block.appendChild(Object.assign(new MdNode('math_inline'), { literal: m[1]! }));
    return true;
  }

  private parseInline(block: MdNode): boolean {
    const c = this.peek();
    if (c === undefined) return false;
    let res = false;
    switch (c) {
      case '\n':
        res = this.parseNewline(block);
        break;
      case '\\':
        res = this.parseBackslash(block);
        break;
      case '`':
        res = this.parseBackticks(block);
        break;
      case '*':
      case '_':
        res = this.handleDelim(c, block);
        break;
      case '~':
        res = this.options.gfm && this.handleDelim(c, block);
        break;
      case '$':
        res = this.options.math && this.parseMath(block);
        break;
      case '[':
        res = this.parseOpenBracket(block);
        break;
      case '!':
        res = this.parseBang(block);
        break;
      case ']':
        res = this.parseCloseBracket(block);
        break;
      case '<':
        res = this.parseAutolink(block) || this.parseHtmlTag(block);
        break;
      case '&':
        res = this.parseEntity(block);
        break;
      default:
        res = this.parseString(block);
    }
    if (!res) {
      this.pos += 1;
      block.appendChild(text(c));
    }
    return true;
  }

  /** Parse a block's text content into its inline children. */
  parse(block: MdNode): void {
    this.subject = block.content.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
    this.pos = 0;
    this.delimiters = null;
    this.brackets = null;
    while (this.parseInline(block));
    block.content = '';
    this.processEmphasis(null);
    if (this.options.gfm) extendedAutolinks(block);
  }

  /** A link reference definition at the start of `s`: its length, or 0. */
  parseReference(s: string): number {
    this.subject = s;
    this.pos = 0;
    const start = 0;
    const n = this.parseLinkLabel();
    if (n === 0) return 0;
    const raw = this.subject.slice(0, n);
    if (this.peek() !== ':') return (this.pos = start), 0;
    this.pos++;
    this.spnl();
    const dest = this.parseLinkDestination();
    if (dest === null) return (this.pos = start), 0;
    const beforeTitle = this.pos;
    this.spnl();
    let title: string | null = null;
    if (this.pos !== beforeTitle) title = this.parseLinkTitle();
    if (title === null) {
      title = '';
      this.pos = beforeTitle;
    }
    let atEnd = true;
    if (this.match(reSpaceAtEndOfLine) === null) {
      if (title === '') atEnd = false;
      else {
        title = '';
        this.pos = beforeTitle;
        atEnd = this.match(reSpaceAtEndOfLine) !== null;
      }
    }
    if (!atEnd) return (this.pos = start), 0;
    const label = normalizeLabel(raw);
    if (label === '') return (this.pos = start), 0;
    if (!this.refmap.has(label)) this.refmap.set(label, { destination: dest, title });
    return this.pos - start;
  }
}

/**
 * GFM extended autolinks: `www.` and `http(s)://` links and e-mail addresses in text, after a space, a line start,
 * or `*`, `_`, `~`, `(`; trailing punctuation and an unbalanced `)` stay outside the link.
 */
function extendedAutolinks(block: MdNode): void {
  // Merge neighbouring text so a link split by delimiter leftovers is seen whole.
  for (let n = block.firstChild; n; n = n.next) {
    if (n.type === 'link' || n.type === 'image' || n.type === 'code' || n.type === 'html_inline') continue;
    if (n.isContainer) {
      extendedAutolinks(n);
      continue;
    }
    if (n.type !== 'text') continue;
    while (n.next && n.next.type === 'text') {
      n.literal += n.next.literal;
      n.next.unlink();
    }
    let cur: MdNode = n;
    for (;;) {
      const found = findAutolink(cur.literal, cur.prev);
      if (!found) break;
      const { start, end, href } = found;
      const before = cur.literal.slice(0, start);
      const linkText = cur.literal.slice(start, end);
      const after = cur.literal.slice(end);
      const link = Object.assign(new MdNode('link'), { destination: normalizeURI(href) });
      link.appendChild(text(linkText));
      cur.literal = before;
      cur.insertAfter(link);
      const rest = text(after);
      link.insertAfter(rest);
      if (!before) cur.unlink();
      cur = rest;
      n = rest;
    }
    if (!cur.literal && cur.parent) {
      const prev = cur.prev ?? cur.parent.firstChild;
      cur.unlink();
      if (!prev) break;
      n = prev;
    }
  }
}

const reWww = /^www\./i;
const reScheme = /^(?:https?|ftp):\/\//i;
const reDomain = /^[\w-]+(?:\.[\w-]+)*/;
const reEmail = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

/** The next extended autolink in `s`, if any. */
function findAutolink(s: string, prev: MdNode | null): { start: number; end: number; href: string } | undefined {
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const boundary = i === 0 ? !(prev?.type === 'text' && /[\w]$/.test(prev.literal)) : /[\s*_~(]/.test(s[i - 1]!);
    if (/[wWhHfF]/.test(c) && boundary) {
      const rest = s.slice(i);
      const scheme = reScheme.exec(rest)?.[0];
      if (scheme || reWww.test(rest)) {
        const afterScheme = rest.slice(scheme?.length ?? 0);
        const domain = reDomain.exec(afterScheme)?.[0];
        if (!domain || !validDomain(domain)) continue;
        const end = trimTrailing(rest, (scheme?.length ?? 0) + domain.length);
        if (end <= (scheme?.length ?? 0) + (scheme ? 0 : 4)) continue;
        const linkText = rest.slice(0, end);
        return { start: i, end: i + end, href: scheme ? linkText : `http://${linkText}` };
      }
    }
    if (c === '@') {
      // Back to the start of the local part, then forward through the domain.
      let a = i;
      while (a > 0 && /[\w.+-]/.test(s[a - 1]!)) a--;
      if (a === i) continue;
      const m = reEmail.exec(s.slice(a));
      if (!m || m.index !== 0) continue;
      let email = m[0];
      email = email.replace(/\.+$/, '');
      if (/[-_]$/.test(email)) continue;
      if (a > 0 && !/[\s*_~(]/.test(s[a - 1]!)) {
        // Inside a word: not a link.
        if (/\w/.test(s[a - 1]!)) continue;
      }
      return { start: a, end: a + email.length, href: `mailto:${email}` };
    }
  }
  return undefined;
}

/** A domain needs a dot unless it is localhost-like, and its last two parts have no underscore. */
function validDomain(d: string): boolean {
  const parts = d.split('.');
  if (parts.some((p) => !p)) return false;
  return !parts.slice(-2).some((p) => p.includes('_'));
}

/** Where a www/http link ends: before whitespace or `<`, minus trailing punctuation, an unbalanced `)` and a trailing entity. */
function trimTrailing(s: string, from: number): number {
  let end = from;
  while (end < s.length && !/[\s<]/.test(s[end]!)) end++;
  for (;;) {
    const last = s[end - 1];
    if (last && /[?!.,:*_~]/.test(last)) {
      end--;
      continue;
    }
    if (last === ')') {
      const body = s.slice(0, end);
      const open = (body.match(/\(/g) ?? []).length;
      const close = (body.match(/\)/g) ?? []).length;
      if (close > open) {
        end--;
        continue;
      }
    }
    if (last === ';') {
      const m = /&[A-Za-z0-9]+;$/.exec(s.slice(0, end));
      if (m) {
        end -= m[0].length;
        continue;
      }
    }
    return end;
  }
}
