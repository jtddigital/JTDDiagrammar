import { ENTITIES } from './entities.ts';

/** Shared Markdown patterns and string helpers (CommonMark 0.31.2). */
export const ESCAPABLE = '[!"#$%&\'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]';
const ENTITY = '&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});';

const TAGNAME = '[A-Za-z][A-Za-z0-9-]*';
const ATTRIBUTENAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const UNQUOTEDVALUE = '[^"\'=<>`\\x00-\\x20]+';
const ATTRIBUTEVALUE = `(?:${UNQUOTEDVALUE}|'[^']*'|"[^"]*")`;
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`;
export const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`;
export const CLOSETAG = `</${TAGNAME}\\s*[>]`;
const COMMENT = '<!-->|<!--->|<!--[\\s\\S]*?-->';
const PROCESSING = '[<][?][\\s\\S]*?[?][>]';
const DECLARATION = '<![A-Za-z][^>]*>';
const CDATA = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
export const reHtmlTag = new RegExp(`^(?:${OPENTAG}|${CLOSETAG}|${COMMENT}|${PROCESSING}|${DECLARATION}|${CDATA})`, 'i');

const reEntityOrEscapedChar = new RegExp(`\\\\${ESCAPABLE}|${ENTITY}`, 'gi');
const reBackslashOrAmp = /[\\&]/;

/** The characters of an entity reference, or the reference itself when it names nothing. */
export function decodeEntity(e: string): string {
  if (e[1] === '#') {
    const hex = e[2] === 'x' || e[2] === 'X';
    const n = parseInt(e.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    // NUL, surrogates and numbers beyond Unicode become the replacement character.
    if (!n || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '�';
    return String.fromCodePoint(n);
  }
  return ENTITIES[e.slice(1, -1)] ?? e;
}

/** Backslash escapes and entities replaced by the characters they stand for. */
export const unescapeString = (s: string) => (reBackslashOrAmp.test(s) ? s.replace(reEntityOrEscapedChar, (m) => (m[0] === '\\' ? m.slice(1) : decodeEntity(m))) : s);

const URI_SAFE = /[A-Za-z0-9;/?:@&=+$,\-_.!~*'()#]/;
/** A link destination percent-encoded as browsers expect, keeping `%XX` that is already encoded. */
export function normalizeURI(uri: string): string {
  let out = '';
  for (let i = 0; i < uri.length; i++) {
    const c = uri[i]!;
    if (c === '%' && /^[0-9a-fA-F]{2}$/.test(uri.slice(i + 1, i + 3))) {
      out += uri.slice(i, i + 3);
      i += 2;
      continue;
    }
    if (URI_SAFE.test(c)) {
      out += c;
      continue;
    }
    const code = c.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < uri.length) {
      const pair = uri.slice(i, i + 2);
      out += /^[\ud800-\udbff][\udc00-\udfff]$/.test(pair) ? encodeURIComponent(pair) : '%EF%BF%BD';
      if (/^[\ud800-\udbff][\udc00-\udfff]$/.test(pair)) i++;
      continue;
    }
    out += code >= 0xd800 && code <= 0xdfff ? '%EF%BF%BD' : encodeURIComponent(c);
  }
  return out;
}

/** Text for HTML. */
export const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));

/** A link label, matched case-insensitively with whitespace collapsed (Unicode case folding). */
export const normalizeLabel = (s: string) =>
  s
    .slice(1, -1)
    .trim()
    .replace(/[ \t\r\n]+/g, ' ')
    .toLowerCase()
    .toUpperCase();

/** Unicode whitespace and punctuation, for emphasis flanking rules. */
export const reUnicodeWhitespace = /^\s/u;
export const rePunctuation = /^[\p{P}\p{S}]/u;
