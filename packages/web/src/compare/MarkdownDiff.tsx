import { diffBlocks, parseMarkdown } from '@jtd/documents';
import { useMemo } from 'react';
import { Markdown, type MarkdownLinks } from '../viewers/Markdown.tsx';

/** Markdown compared in rendered form (URS-WS-033): both pages side by side, changed blocks marked. */
export function MarkdownDiff({ a, b, links }: { a: string; b: string; links: MarkdownLinks }) {
  const docA = useMemo(() => parseMarkdown(a, { gfm: true, extras: true }), [a]);
  const docB = useMemo(() => parseMarkdown(b, { gfm: true, extras: true }), [b]);
  const d = useMemo(() => diffBlocks(docA, docB), [docA, docB]);
  return (
    <div className="diff">
      <div className="diff__bar cluster text-small">
        <span className="diff__count" data-kind="ins">{d.added} added</span>
        <span className="diff__count" data-kind="del">{d.removed} removed</span>
        <span className="diff__count" data-kind="change">{d.changed} changed</span>
      </div>
      <div className="diff__columns">
        <section aria-label="Before" className="diff__page">
          <Markdown text={a} parsed={docA} marks={d.a} links={links} />
        </section>
        <section aria-label="After" className="diff__page">
          <Markdown text={b} parsed={docB} marks={d.b} links={links} />
        </section>
      </div>
    </div>
  );
}
