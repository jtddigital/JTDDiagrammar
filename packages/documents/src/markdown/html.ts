import { escapeXml as esc, normalizeURI } from './common.ts';
import type { MdNode } from './node.ts';

const TAGFILTER = /<(?=\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:[\s/>]|$))/gi;

/**
 * HTML exactly as the CommonMark and GFM spec examples expect it (URS-WS-040). Used by the tests only: the app
 * renders the tree as elements and never as an HTML string (URS-WS-042).
 */
export function renderHtml(doc: MdNode, options: { gfm?: boolean } = {}): string {
  let out = '';
  let last = '\n';
  let noTags = 0;
  const lit = (s: string) => {
    out += s;
    last = s;
  };
  const cr = () => last !== '\n' && lit('\n');
  const tag = (name: string, attrs: [string, string][] = [], self = false) => {
    if (noTags > 0) return;
    lit(`<${name}${attrs.map(([k, v]) => ` ${k}="${v}"`).join('')}${self ? ' /' : ''}>`);
  };
  const raw = (s: string) => (options.gfm ? s.replace(TAGFILTER, '&lt;') : s);
  const footnotes: MdNode[] = [];

  const render = (n: MdNode): void => {
    const kids = () => {
      for (const c of n.children()) render(c);
    };
    switch (n.type) {
      case 'document':
        kids();
        break;
      case 'text':
        lit(esc(n.literal));
        break;
      case 'softbreak':
        lit('\n');
        break;
      case 'linebreak':
        tag('br', [], true);
        cr();
        break;
      case 'emph':
      case 'strong':
      case 'strikethrough': {
        const t = n.type === 'emph' ? 'em' : n.type === 'strong' ? 'strong' : 'del';
        tag(t);
        kids();
        tag(`/${t}`);
        break;
      }
      case 'code':
        tag('code');
        lit(esc(n.literal));
        tag('/code');
        break;
      case 'html_inline':
        lit(raw(n.literal));
        break;
      case 'link': {
        tag('a', [['href', esc(n.destination)], ...(n.title ? [['title', esc(n.title)] as [string, string]] : [])]);
        kids();
        tag('/a');
        break;
      }
      case 'image':
        if (noTags === 0) lit(`<img src="${esc(n.destination)}" alt="`);
        noTags++;
        kids();
        noTags--;
        if (noTags === 0) lit(`${n.title ? `" title="${esc(n.title)}` : ''}" />`);
        break;
      case 'footnote_ref': {
        const id = normalizeURI(n.literal);
        const suffix = n.refIndex > 1 ? `-${n.refIndex}` : '';
        lit(`<sup class="footnote-ref"><a href="#fn-${id}" id="fnref-${id}${suffix}" data-footnote-ref>${n.index}</a></sup>`);
        break;
      }
      case 'paragraph': {
        const tight = n.parent?.parent?.type === 'list' && n.parent.parent.listData.tight;
        if (!tight) {
          cr();
          tag('p');
        }
        kids();
        const def = n.parent?.type === 'footnote_definition' && n.parent.lastChild === n ? n.parent : undefined;
        if (def) lit(` ${backrefs(def)}`);
        if (!tight) {
          tag('/p');
          cr();
        }
        break;
      }
      case 'heading':
        cr();
        tag(`h${n.level}`);
        kids();
        tag(`/h${n.level}`);
        cr();
        break;
      case 'code_block': {
        const lang = n.info.split(/\s+/)[0];
        cr();
        tag('pre');
        tag('code', lang ? [['class', `language-${esc(lang)}`]] : []);
        lit(esc(n.literal));
        tag('/code');
        tag('/pre');
        cr();
        break;
      }
      case 'html_block':
        cr();
        lit(raw(n.literal));
        cr();
        break;
      case 'thematic_break':
        cr();
        tag('hr', [], true);
        cr();
        break;
      case 'block_quote':
        cr();
        tag('blockquote');
        cr();
        kids();
        cr();
        tag('/blockquote');
        cr();
        break;
      case 'list': {
        const t = n.listData.type === 'bullet' ? 'ul' : 'ol';
        const start = n.listData.start;
        cr();
        tag(t, start !== undefined && start !== 1 ? [['start', String(start)]] : []);
        cr();
        kids();
        cr();
        tag(`/${t}`);
        cr();
        break;
      }
      case 'item':
        tag('li');
        if (n.checked !== undefined) lit(`<input ${n.checked ? 'checked="" ' : ''}disabled="" type="checkbox"> `);
        kids();
        tag('/li');
        cr();
        break;
      case 'table': {
        cr();
        tag('table');
        cr();
        const [head, ...body] = [...n.children()];
        const row = (r: MdNode, cell: string) => {
          tag('tr');
          cr();
          for (const c of r.children()) {
            tag(cell, c.align[0] ? [['align', c.align[0]]] : []);
            for (const k of c.children()) render(k);
            tag(`/${cell}`);
            cr();
          }
          tag('/tr');
          cr();
        };
        tag('thead');
        cr();
        if (head) row(head, 'th');
        tag('/thead');
        cr();
        if (body.length) {
          tag('tbody');
          cr();
          body.forEach((r) => row(r, 'td'));
          tag('/tbody');
          cr();
        }
        tag('/table');
        cr();
        break;
      }
      case 'footnote_definition':
        if (n.index) footnotes.push(n);
        break;
      case 'math_inline':
      case 'math_block':
      case 'front_matter':
        lit(esc(n.literal));
        break;
      default:
        kids();
    }
  };

  /** Links back to every reference of a footnote. */
  const backrefs = (def: MdNode) => {
    const id = normalizeURI(def.literal);
    return Array.from({ length: def.refIndex }, (_, i) => {
      const k = i + 1;
      const suffix = k > 1 ? `-${k}` : '';
      const idx = k > 1 ? `${def.index}-${k}` : `${def.index}`;
      return `<a href="#fnref-${id}${suffix}" class="footnote-backref" data-footnote-backref data-footnote-backref-idx="${idx}" aria-label="Back to reference ${idx}">↩${k > 1 ? `<sup class="footnote-ref">${k}</sup>` : ''}</a>`;
    }).join(' ');
  };

  render(doc);
  if (footnotes.length) {
    cr();
    lit('<section class="footnotes" data-footnotes>\n<ol>\n');
    for (const def of footnotes.sort((a, b) => a.index - b.index)) {
      lit(`<li id="fn-${normalizeURI(def.literal)}">\n`);
      last = '\n';
      for (const c of def.children()) render(c);
      if (def.lastChild?.type !== 'paragraph') {
        cr();
        lit(backrefs(def));
        lit('\n');
      }
      cr();
      lit('</li>\n');
    }
    lit('</ol>\n</section>\n');
  }
  return out;
}
