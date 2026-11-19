/**
 * The HTML a Markdown file may carry (URS-WS-042): `details`, `summary`, `kbd`, `sub`, `sup`, `br` and `mark`,
 * with no attributes but `open` on `details`. Other tags are dropped and their text kept, except `script` and
 * `style`, whose content goes too. Nothing here produces markup: callers build elements from the parts.
 */
export const ALLOWED = new Set(['details', 'summary', 'kbd', 'sub', 'sup', 'br', 'mark']);
const VOID = new Set(['br']);
const SILENT = new Set(['script', 'style', 'textarea', 'title', 'iframe', 'noscript', 'template', 'xmp', 'noembed', 'noframes', 'plaintext']);

export type HtmlPart = { kind: 'text'; text: string } | { kind: 'open'; tag: string; open?: boolean } | { kind: 'close'; tag: string } | { kind: 'void'; tag: string };

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** The few entities raw HTML usually carries; others stay as written. */
const decode = (s: string) => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' || e[1] === 'X' ? 2 : 1), e[1] === 'x' || e[1] === 'X' ? 16 : 10) || 0xfffd) : (ENTITY[e.toLowerCase()] ?? m)));

/**
 * The parts of an HTML fragment: allowed tags, and text (other tags removed). The second argument carries an open `script`
 * (or the like) across fragments, as inline HTML comes one tag at a time.
 */
export function htmlParts(html: string, state: { silent?: string } = {}): HtmlPart[] {
  const out: HtmlPart[] = [];
  let silent = state.silent;
  const re = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[\s\S]*?(?:\?>|$)|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index > last && !silent) out.push({ kind: 'text', text: decode(html.slice(last, m.index)) });
    last = re.lastIndex;
    const [, slash, name, attrs] = m;
    if (!name) continue;
    const tag = name.toLowerCase();
    if (silent) {
      if (slash && tag === silent) silent = undefined;
      continue;
    }
    if (SILENT.has(tag) && !slash) {
      if (!/\/\s*$/.test(attrs ?? '')) silent = tag;
      continue;
    }
    if (!ALLOWED.has(tag)) continue;
    if (VOID.has(tag)) out.push({ kind: 'void', tag });
    else if (slash) out.push({ kind: 'close', tag });
    else out.push({ kind: 'open', tag, ...(tag === 'details' && /(^|\s)open(\s|=|$)/i.test(attrs ?? '') && { open: true }) });
  }
  if (last < html.length && !silent) out.push({ kind: 'text', text: decode(html.slice(last)) });
  state.silent = silent;
  return out;
}

const SAFE_LINK = /^(?:https?:|mailto:)/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Whether a link may be followed: http, https and mailto, an anchor, or a relative path (URS-WS-042). */
export const safeHref = (href: string) => {
  // Browsers drop tabs, line breaks and controls from URLs, so `java\tscript:` is still a scheme.
  const h = href.replace(/[\x00-\x20]/g, '');
  return SAFE_LINK.test(h) || !SCHEME.test(h);
};
/** Whether an image may be loaded: http(s) or an inline picture; relative paths are workspace files. */
export const safeSrc = (src: string) => /^https?:/i.test(src) || /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(src);
