import { parseJson, parseSource, render, type SourceFormat } from '@jtd/core';
import { highlight, language, parseCsv, parseMarkdown, plainText, slugger, texToMathml, type Mark, type MathEl, type MdNode } from '@jtd/documents';
import { cloneElement, createElement, Fragment, isValidElement, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sanitizeSvg } from '../preview/sanitize.ts';
import { registry } from '../registry.ts';
import { kindOf } from '../workspace/kinds.ts';
import { htmlParts, safeHref, safeSrc } from './safeHtml.ts';

/** How the viewer reaches the workspace: relative links and images name files there (URS-WS-041). */
export interface MarkdownLinks {
  /** Open the workspace file at this path, relative to the Markdown file; false when there is none. */
  open(path: string): boolean;
  /** The text of the workspace file at this path, for SVG images. */
  read(path: string): Promise<string | undefined>;
}

/** `<!-- toc -->` asks for a table of contents, as Markdown TOC tools write it; `<!-- tocstop -->` ends a list they generated. */
const TOC_COMMENT = /^\s*<!--\s*toc\s*-->\s*$/i;
const TOC_STOP = /^\s*<!--\s*(?:tocstop|\/toc)\s*-->\s*$/i;
/** `![[path]]` or `![[path|caption]]`: a workspace file shown in place (URS-WS-044). */
const EMBED = /^!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/;
/** Embeds inside embeds stop here, so files that embed each other cannot loop. */
const MAX_DEPTH = 3;
/** Rows of an embedded table; the caption counts them all. */
const EMBED_ROWS = 200;

const ALERT_TITLES: Record<string, string> = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };

/**
 * A Markdown file rendered in Preview (URS-WS-040..042), as React elements built from the parsed tree: never an
 * HTML string. GFM, GitHub alerts, heading anchors, a table of contents, front matter, highlighted code, MathML
 * math and ```jtd diagrams; links and images to workspace files open or show them.
 */
export function Markdown({ text, links, parsed, marks, depth = 0 }: { text: string; links: MarkdownLinks; parsed?: MdNode; marks?: ReadonlyMap<MdNode, Mark>; depth?: number }) {
  const deferred = useDeferredValue(text);
  const own = useMemo(() => (parsed ? undefined : parseMarkdown(deferred, { gfm: true, extras: true })), [deferred, parsed]);
  const doc = parsed ?? own!;
  const host = useRef<HTMLElement>(null);
  const out = useMemo(
    () => new Renderer(links, (id) => host.current?.querySelector(`[id="${CSS.escape(`md-${id}`)}"]`)?.scrollIntoView({ block: 'start' }), marks, depth).document(doc),
    [doc, links, marks, depth],
  );
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
  /** Blocks marked by a comparison (URS-WS-033). */
  private readonly marks: ReadonlyMap<MdNode, Mark> | undefined;

  readonly depth: number;

  constructor(links: MarkdownLinks, jump: (id: string) => void, marks?: ReadonlyMap<MdNode, Mark>, depth = 0) {
    this.depth = depth;
    this.links = links;
    this.jump = jump;
    this.marks = marks;
  }

  private mark = (n: MdNode) => (this.marks?.has(n) ? { 'data-diff': this.marks.get(n) } : {});

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

  /**
   * Blocks in order. Allowed HTML tags opened in one HTML block stay open over the blocks after it, so a
   * `<details>` holds the paragraphs, lists and code up to its `</details>` (URS-WS-042). An HTML comment
   * `<!-- toc -->` is a table of contents; a generated list up to `<!-- tocstop -->` is replaced by it.
   */
  private blocks(parent: MdNode): ReactNode[] {
    type Frame = { tag: string; open?: boolean; kids: ReactNode[] };
    const stack: Frame[] = [{ tag: '', kids: [] }];
    const close = () => {
      const f = stack.pop()!;
      stack.at(-1)!.kids.push(createElement(f.tag, { key: this.k(), ...(f.open && { open: true }) }, ...f.kids));
    };
    const kids = [...parent.children()];
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i]!;
      if (n.type !== 'html_block') {
        const el = this.marked(n);
        if (el !== null) stack.at(-1)!.kids.push(el);
        continue;
      }
      if (TOC_COMMENT.test(n.literal)) {
        stack.at(-1)!.kids.push(this.toc());
        const stop = kids.findIndex((x, j) => j > i && x.type === 'html_block' && TOC_STOP.test(x.literal));
        if (stop > 0) i = stop;
        continue;
      }
      // Text of an HTML block reads as a block of its own, unless it sits in an inline tag such as <summary>.
      let text: ReactNode[] = [];
      const flush = () => {
        if (text.some((t) => typeof t !== 'string' || t.trim())) stack.at(-1)!.kids.push(<div key={this.k()} className="md-html">{text}</div>);
        text = [];
      };
      const inline = () => !['', 'details'].includes(stack.at(-1)!.tag);
      for (const p of htmlParts(n.literal)) {
        if (p.kind === 'text') (inline() ? stack.at(-1)!.kids : text).push(p.text);
        else if (p.kind === 'void') (inline() ? stack.at(-1)!.kids : text).push(<br key={this.k()} />);
        else if (p.kind === 'open') {
          flush();
          stack.push({ tag: p.tag, kids: [], ...(p.open && { open: true }) });
        } else if (stack.some((f, d) => d > 0 && f.tag === p.tag)) {
          flush();
          while (stack.length > 1 && stack.at(-1)!.tag !== p.tag) close();
          close();
        }
      }
      flush();
    }
    while (stack.length > 1) close();
    return stack[0]!.kids;
  }

  private toc(): ReactNode {
    return (
      <nav key={this.k()} className="md-toc" aria-label="Contents">
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
  }

  /** A block, carrying its comparison mark: on its own element, or a wrapper when it has none. */
  private marked(n: MdNode): ReactNode {
    const el = this.block(n);
    const m = this.mark(n);
    if (!('data-diff' in m) || !isValidElement(el)) return el;
    if (typeof el.type === 'string') return cloneElement(el as React.ReactElement<Record<string, unknown>>, m);
    return (
      <div key={el.key} className="md-mark" {...m}>
        {el}
      </div>
    );
  }

  private block(n: MdNode): ReactNode {
    const key = this.k();
    switch (n.type) {
      case 'paragraph': {
        // A paragraph that is only an embed shows the workspace file in its place (URS-WS-044).
        const only = n.firstChild && !n.firstChild.next ? n.firstChild : undefined;
        const wiki = only?.type === 'text' ? EMBED.exec(only.literal.trim()) : null;
        if (wiki) return <WorkspaceEmbed key={key} path={wiki[1]!.trim()} alt={wiki[2]?.trim() ?? ''} links={this.links} depth={this.depth} block />;
        if (only?.type === 'image' && !/^[a-z][a-z0-9+.-]*:/i.test(only.destination))
          return <WorkspaceEmbed key={key} path={decodeURIComponent(only.destination)} alt={plainText(only)} links={this.links} depth={this.depth} block />;
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
          <li key={this.k()} {...(item.checked !== undefined && { className: 'md-task' })} {...this.mark(item)}>
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
      case 'table': {
        const [head, ...body] = [...n.children()];
        const row = (r: MdNode, cell: 'th' | 'td') => (
          <tr key={this.k()} {...this.mark(r)}>
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
        return this.toc();
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
        return <WorkspaceEmbed key={key} path={decodeURIComponent(src)} alt={alt} links={this.links} depth={this.depth} />;
      }
      default:
        return null;
    }
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
function JtdDiagram({ source, format, caption }: { source: string; format?: SourceFormat; caption?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const r = useMemo(() => {
    const json = format && format !== 'json' ? parseSource(source, format, registry) : parseJson(source);
    const value = json.value ?? (format ? undefined : parseSource(source, 'yaml', registry).value);
    if (value === undefined) return { diagnostics: json.diagnostics };
    return render(value, registry);
  }, [source, format]);
  useEffect(() => {
    const el = r.svg ? sanitizeSvg(r.svg) : undefined;
    host.current?.replaceChildren(...(el ? [el] : []));
  }, [r.svg]);
  return (
    <figure className="md-diagram">
      <div ref={host} />
      {caption && r.svg && <figcaption className="md-caption">{caption}</figcaption>}
      {!r.svg && (
        <figcaption className="md-missing">
          {r.diagnostics.slice(0, 3).map((d) => `${d.path || '/'}: ${d.message}`).join(' · ') || 'Not a diagram'}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * A workspace file shown in place (URS-WS-041, WS-044): an SVG as a picture (through an <img>, which never runs it),
 * a diagram drawn, a CSV as a table, Markdown rendered and text as it is. `block` when it stands as a paragraph of its own.
 */
function WorkspaceEmbed({ path, alt, links, depth, block }: { path: string; alt: string; links: MarkdownLinks; depth: number; block?: boolean }) {
  const [text, setText] = useState<string | null>();
  useEffect(() => {
    let live = true;
    void links.read(path).then((t) => live && setText(t ?? null));
    return () => {
      live = false;
    };
  }, [path, links]);
  const name = path.split('/').pop() ?? path;
  if (text === undefined) return <span className="md-missing">{alt || path}</span>;
  if (text === null) return <span className="md-missing">{alt || path} (no such file in the workspace)</span>;
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`} alt={alt} />;
  if (!block) return <span className="md-missing">{alt || path}</span>;
  if (depth >= MAX_DEPTH) return <p className="md-missing">{name}: embedded too deeply to show</p>;
  const k = kindOf(name, text, registry);
  const caption = alt || name;
  if (k.kind === 'diagram') return <JtdDiagram source={text} {...(k.format && { format: k.format })} caption={caption} />;
  if (k.kind === 'markdown')
    return (
      <section className="md-embed" aria-label={caption}>
        <Markdown text={text} links={links} depth={depth + 1} />
      </section>
    );
  if (k.kind === 'csv') {
    const [head = [], ...rows] = parseCsv(text, name.toLowerCase().endsWith('.tsv') ? '\t' : undefined).rows;
    return (
      <div className="md-table">
        <table>
          <caption className="md-caption">
            {caption} · {rows.length.toLocaleString()} row{rows.length === 1 ? '' : 's'}
            {rows.length > EMBED_ROWS && `, first ${EMBED_ROWS} shown`}
          </caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, EMBED_ROWS).map((r, i) => (
              <tr key={i}>
                {head.map((_, c) => (
                  <td key={c}>{r[c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <figure className="md-embed-text">
      <pre className="md-code">
        <code>{text}</code>
      </pre>
      <figcaption className="md-caption">{caption}</figcaption>
    </figure>
  );
}
