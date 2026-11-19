import { parseJson, parseSource, render } from '@jtd/core';
import { highlight, language, parseMarkdown, plainText, slugger, texToMathml, type MathEl, type MdNode } from '@jtd/documents';
import { createElement, Fragment, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sanitizeSvg } from '../preview/sanitize.ts';
import { registry } from '../registry.ts';
import { htmlParts, safeHref, safeSrc, type HtmlPart } from './safeHtml.ts';

/** How the viewer reaches the workspace: relative links and images name files there (URS-WS-041). */
export interface MarkdownLinks {
  /** Open the workspace file at this path, relative to the Markdown file; false when there is none. */
  open(path: string): boolean;
  /** The text of the workspace file at this path, for SVG images. */
  read(path: string): Promise<string | undefined>;
}

const ALERT_TITLES: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };

/**
 * A Markdown file rendered in Preview (URS-WS-040..042), as React elements built from the parsed tree: never an
 * HTML string. GFM, GitHub alerts, heading anchors, a table of contents, front matter, highlighted code, MathML
 * math and ```jtd diagrams; links and images to workspace files open or show them.
 */
export function Markdown({ text, links }: { text: string; links: MarkdownLinks }) {
  const deferred = useDeferredValue(text);
  const doc = useMemo(() => parseMarkdown(deferred, { gfm: true, extras: true }), [deferred]);
  const host = useRef<HTMLElement>(null);
  const out = useMemo(() => new Renderer(links, (id) => host.current?.querySelector(`[id="${CSS.escape(`md-${id}`)}"]`)?.scrollIntoView({ block: 'start' })).document(doc), [doc, links]);
  return (
    <article className="md" ref={host}>
      {out}
    </article>
  );
}

class Renderer {
  private readonly slug = slugger();
  private readonly headings: { level: number; text: string; id: string }[] = [];
  private readonly footnotes: MdNode[] = [];
  private key = 0;
  private readonly links: MarkdownLinks;
  private readonly jump: (id: string) => void;

  constructor(links: MarkdownLinks, jump: (id: string) => void) {
    this.links = links;
    this.jump = jump;
  }

  document(doc: MdNode): ReactNode {
    // Headings first, so a table of contents anywhere lists them all.
    const walk = (n: MdNode) => {
      for (const c of n.children())
        if (c.type === 'heading') {
          const t = plainText(c);
          this.headings.push({ level: c.level, text: t, id: this.slug(t) });
        } else if (c.type === 'block_quote' || c.type === 'list' || c.type === 'item') walk(c);
    };
    walk(doc);
    this.headingIndex = 0;
    const body = this.blocks(doc);
    const notes = this.footnotes.filter((d) => d.index).sort((a, b) => a.index - b.index);
    return (
      <>
        {body}
        {notes.length > 0 && (
          <section className="md-footnotes" aria-label="Footnotes">
            <ol>
              {notes.map((d) => (
                <li key={d.label} id={`md-fn-${d.literal}`}>
                  {this.blocks(d)}
                  {Array.from({ length: d.refIndex }, (_, i) => (
                    <a key={i} href={`#fnref-${d.literal}${i ? `-${i + 1}` : ''}`} className="md-backref" aria-label={`Back to reference ${d.index}${i ? `-${i + 1}` : ''}`} onClick={this.anchor(`fnref-${d.literal}${i ? `-${i + 1}` : ''}`)}>
                      ↩{i ? <sup>{i + 1}</sup> : null}
                    </a>
                  ))}
                </li>
              ))}
            </ol>
          </section>
        )}
      </>
    );
  }

  private headingIndex = 0;
  private k = () => this.key++;

  private anchor = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    this.jump(id);
  };

  private blocks(parent: MdNode): ReactNode[] {
    return [...parent.children()].map((n) => this.block(n)).filter((x) => x !== null);
  }

  private block(n: MdNode): ReactNode {
    const key = this.k();
    switch (n.type) {
      case 'paragraph': {
        const tight = n.parent?.parent?.type === 'list' && n.parent.parent.listData.tight;
        const kids = this.inlines(n);
        return tight ? <Fragment key={key}>{kids}</Fragment> : <p key={key}>{kids}</p>;
      }
      case 'heading': {
        const h = this.headings[this.headingIndex++] ?? { id: this.slug(plainText(n)) };
        return createElement(
          `h${n.level}`,
          { key, id: `md-${h.id}` },
          <a className="md-anchor" href={`#${h.id}`} aria-hidden="true" tabIndex={-1} onClick={this.anchor(h.id)}>
            #
          </a>,
          ...this.inlines(n),
        );
      }
      case 'thematic_break':
        return <hr key={key} />;
      case 'block_quote':
        if (n.alert)
          return (
            <div key={key} className="md-alert" data-kind={n.alert.toLowerCase()} role="note">
              <p className="md-alert__title">{ALERT_TITLES[n.alert]}</p>
              {this.blocks(n)}
            </div>
          );
        return <blockquote key={key}>{this.blocks(n)}</blockquote>;
      case 'list': {
        const items = [...n.children()].map((item) => (
          <li key={this.k()} {...(item.checked !== undefined && { className: 'md-task' })}>
            {item.checked !== undefined && <input type="checkbox" checked={item.checked} disabled aria-label={item.checked ? 'Done' : 'Not done'} />}
            {this.blocks(item)}
          </li>
        ));
        return n.listData.type === 'bullet' ? (
          <ul key={key}>{items}</ul>
        ) : (
          <ol key={key} {...(n.listData.start !== 1 && { start: n.listData.start })}>
            {items}
          </ol>
        );
      }
      case 'code_block': {
        const lang = n.info.split(/\s+/)[0]?.toLowerCase() ?? '';
        if (lang === 'jtd') return <JtdDiagram key={key} source={n.literal} />;
        const tokens = highlight(n.literal, language(n.info));
        return (
          <pre key={key} className="md-code" {...(lang && { 'data-lang': lang })}>
            <code>
              {tokens.map((t, i) =>
                t.kind === 'plain' ? (
                  t.text
                ) : (
                  <span key={i} className={`tok-${t.kind}`}>
                    {t.text}
                  </span>
                ),
              )}
            </code>
          </pre>
        );
      }
      case 'html_block':
        return <div key={key} className="md-html">{this.html(htmlParts(n.literal))}</div>;
      case 'table': {
        const [head, ...body] = [...n.children()];
        const row = (r: MdNode, cell: 'th' | 'td') => (
          <tr key={this.k()}>
            {[...r.children()].map((c) => createElement(cell, { key: this.k(), ...(c.align[0] && { style: { textAlign: c.align[0] } }) }, ...this.inlines(c)))}
          </tr>
        );
        return (
          <div key={key} className="md-table">
            <table>
              {head && <thead>{row(head, 'th')}</thead>}
              {body.length > 0 && <tbody>{body.map((r) => row(r, 'td'))}</tbody>}
            </table>
          </div>
        );
      }
      case 'footnote_definition':
        this.footnotes.push(n);
        return null;
      case 'math_block':
        return <MathView key={key} el={texToMathml(n.literal.trim(), true)} />;
      case 'front_matter':
        return <FrontMatter key={key} text={n.literal} />;
      case 'toc':
        return (
          <nav key={key} className="md-toc" aria-label="Contents">
            <ul>
              {this.headings.map((h) => (
                <li key={this.k()} style={{ paddingInlineStart: `${(h.level - 1) * 1}em` }}>
                  <a href={`#${h.id}`} onClick={this.anchor(h.id)}>
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        );
      default:
        return null;
    }
  }

  /** Inline children; allowed inline HTML tags wrap what lies between them. */
  private inlines(parent: MdNode): ReactNode[] {
    const stack: { tag: string; open?: boolean; kids: ReactNode[] }[] = [{ tag: '', kids: [] }];
    const top = () => stack.at(-1)!.kids;
    const close = (tag: string) => {
      const i = stack.findLastIndex((s) => s.tag === tag);
      if (i < 1) return;
      while (stack.length > i) {
        const s = stack.pop()!;
        top().push(createElement(s.tag, { key: this.k(), ...(s.open && { open: true }) }, ...s.kids));
      }
    };
    const state: { silent?: string } = {};
    for (const n of parent.children()) {
      // Inside an inline <script> or <style>: nothing shows until it closes.
      if (state.silent && n.type !== 'html_inline') continue;
      if (n.type === 'html_inline') {
        for (const p of htmlParts(n.literal, state)) {
          if (p.kind === 'text') top().push(p.text);
          else if (p.kind === 'void') top().push(<br key={this.k()} />);
          else if (p.kind === 'open') stack.push({ tag: p.tag, kids: [], ...(p.open && { open: true }) });
          else close(p.tag);
        }
      } else top().push(this.inline(n));
    }
    while (stack.length > 1) close(stack.at(-1)!.tag);
    return stack[0]!.kids;
  }

  private inline(n: MdNode): ReactNode {
    const key = this.k();
    switch (n.type) {
      case 'text':
        return n.literal;
      case 'softbreak':
        return '\n';
      case 'linebreak':
        return <br key={key} />;
      case 'emph':
        return <em key={key}>{this.inlines(n)}</em>;
      case 'strong':
        return <strong key={key}>{this.inlines(n)}</strong>;
      case 'strikethrough':
        return <del key={key}>{this.inlines(n)}</del>;
      case 'code':
        return <code key={key}>{n.literal}</code>;
      case 'math_inline':
        return <MathView key={key} el={texToMathml(n.literal)} />;
      case 'footnote_ref': {
        const id = `fnref-${n.literal}${n.refIndex > 1 ? `-${n.refIndex}` : ''}`;
        return (
          <sup key={key} className="md-fnref" id={`md-${id}`}>
            <a href={`#fn-${n.literal}`} onClick={this.anchor(`fn-${n.literal}`)}>
              {n.index}
            </a>
          </sup>
        );
      }
      case 'link': {
        const href = n.destination;
        const kids = this.inlines(n);
        if (!safeHref(href)) return <Fragment key={key}>{kids}</Fragment>;
        if (href.startsWith('#'))
          return (
            <a key={key} href={href} onClick={this.anchor(decodeURIComponent(href.slice(1)))}>
              {kids}
            </a>
          );
        if (/^(?:https?:|mailto:)/i.test(href))
          return (
            <a key={key} href={href} target="_blank" rel="noopener noreferrer" {...(n.title && { title: n.title })}>
              {kids}
            </a>
          );
        // A workspace file: opened in the app.
        return (
          <a
            key={key}
            href={href}
            className="md-filelink"
            {...(n.title && { title: n.title })}
            onClick={(e) => {
              e.preventDefault();
              this.links.open(decodeURIComponent(href.split('#')[0]!));
            }}
          >
            {kids}
          </a>
        );
      }
      case 'image': {
        const alt = plainText(n);
        const src = n.destination;
        if (safeSrc(src)) return <img key={key} src={src} alt={alt} {...(n.title && { title: n.title })} loading="lazy" referrerPolicy="no-referrer" />;
        if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return <span key={key} className="md-missing">{alt}</span>;
        return <WorkspaceImage key={key} path={decodeURIComponent(src)} alt={alt} read={this.links.read} />;
      }
      default:
        return null;
    }
  }

  /** Allowed HTML of an HTML block, as elements. */
  private html(parts: HtmlPart[]): ReactNode[] {
    const stack: { tag: string; open?: boolean; kids: ReactNode[] }[] = [{ tag: '', kids: [] }];
    for (const p of parts) {
      const top = stack.at(-1)!.kids;
      if (p.kind === 'text') top.push(p.text);
      else if (p.kind === 'void') top.push(<br key={this.k()} />);
      else if (p.kind === 'open') stack.push({ tag: p.tag, kids: [], ...(p.open && { open: true }) });
      else if (stack.some((s) => s.tag === p.tag)) {
        while (stack.length > 1) {
          const s = stack.pop()!;
          stack.at(-1)!.kids.push(createElement(s.tag, { key: this.k(), ...(s.open && { open: true }) }, ...s.kids));
          if (s.tag === p.tag) break;
        }
      }
    }
    while (stack.length > 1) {
      const s = stack.pop()!;
      stack.at(-1)!.kids.push(createElement(s.tag, { key: this.k(), ...(s.open && { open: true }) }, ...s.kids));
    }
    return stack[0]!.kids;
  }
}

/** MathML from the TeX converter, as elements in the MathML namespace (React puts `math` and its children there). */
function MathView({ el }: { el: MathEl }) {
  const build = (e: MathEl | string, key: number): ReactNode => {
    if (typeof e === 'string') return e;
    const attrs = Object.fromEntries(Object.entries(e.attrs ?? {}).filter(([k]) => !k.startsWith('data-')));
    return createElement(e.tag, { key, ...attrs }, ...e.children.map((c, i) => build(c, i)));
  };
  return <>{build(el, 0)}</>;
}

/** Front matter as a small table of `key: value` lines; anything else as written. */
function FrontMatter({ text }: { text: string }) {
  const rows = text.split('\n').map((l) => /^([\w.-]+):\s*(.*)$/.exec(l));
  if (rows.some((r) => !r)) return <pre className="md-frontmatter">{text}</pre>;
  return (
    <table className="md-frontmatter">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <th scope="row">{r![1]}</th>
            <td>{r![2]!.replace(/^(["'])(.*)\1$/, '$2')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A ```jtd block: the diagram, drawn as in Preview and sanitised the same way; problems listed instead. */
function JtdDiagram({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null);
  const r = useMemo(() => {
    const json = parseJson(source);
    const value = json.value ?? parseSource(source, 'yaml', registry).value;
    if (value === undefined) return { diagnostics: json.diagnostics };
    return render(value, registry);
  }, [source]);
  useEffect(() => {
    const el = r.svg ? sanitizeSvg(r.svg) : undefined;
    host.current?.replaceChildren(...(el ? [el] : []));
  }, [r.svg]);
  return (
    <figure className="md-diagram">
      <div ref={host} />
      {!r.svg && (
        <figcaption className="md-missing">
          {r.diagnostics.slice(0, 3).map((d) => `${d.path || '/'}: ${d.message}`).join(' · ') || 'Not a diagram'}
        </figcaption>
      )}
    </figure>
  );
}

/** An image that is a workspace file: SVG text shown through an <img>, which never runs it. */
function WorkspaceImage({ path, alt, read }: { path: string; alt: string; read: MarkdownLinks['read'] }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    void read(path).then((t) => live && t !== undefined && /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t) && setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`));
    return () => {
      live = false;
    };
  }, [path, read]);
  return src ? <img src={src} alt={alt} /> : <span className="md-missing">{alt || path}</span>;
}
