import { useEffect, useMemo, useState } from 'react';
import { registry } from '../registry.ts';
import type { MarkdownLinks } from '../viewers/Markdown.tsx';
import { kindOf, type Kind } from '../workspace/kinds.ts';
import type { Version } from '../workspace/store.ts';
import { pathOf } from '../workspace/tree.ts';
import type { Workspace } from '../workspace/useWorkspace.ts';
import type { Comparison, Side } from './comparison.ts';
import { CsvDiff } from './CsvDiff.tsx';
import { MarkdownDiff } from './MarkdownDiff.tsx';
import { TextDiff } from './TextDiff.tsx';

type View = 'text' | 'rendered' | 'table';
const VIEW_LABELS: Record<View, string> = { text: 'Text', rendered: 'Rendered', table: 'Table' };
/** Views beyond the text one, when both sides are of a kind. */
const EXTRA: Partial<Record<Kind, View>> = { markdown: 'rendered', csv: 'table' };

/**
 * The Compare pane (URS-WS-031, WS-032): two sides, each any file's saved version or current text, compared
 * as text always, and in the form their kind is read in when both sides share it.
 */
export function ComparePane({ ws, comparison, onChange, onClose, links }: { ws: Workspace; comparison: Comparison; onChange(c: Comparison): void; onClose(): void; links: MarkdownLinks }) {
  const { a, b } = comparison;
  const [versions, setVersions] = useState<Record<string, Version[]>>({});
  const [texts, setTexts] = useState<[string, string]>();
  const { read, versionText, nodes } = ws;

  // Versions and texts are read again when the tree changes (saves, restores) or the current text does.
  useEffect(() => {
    let live = true;
    const load = async () => {
      const ids = [...new Set([a.file, b.file])];
      const lists = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await ws.versions(id)] as const)));
      const text = async (s: Side) => {
        if (s.version === undefined) return (await read(s.file)) ?? '';
        const v = lists[s.file]?.find((x) => x.n === s.version);
        return v ? versionText(v) : '';
      };
      const both = await Promise.all([text(a), text(b)]);
      if (!live) return;
      setVersions(lists);
      setTexts(both);
    };
    void load();
    return () => {
      live = false;
    };
    // `read` changes with the open file's text; `nodes` with saves and restores.
  }, [a, b, read, versionText, nodes, ws]);

  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? '';
  const nameA = nameOf(a.file);
  const nameB = nameOf(b.file);
  const kinds = useMemo(() => (texts ? [kindOf(nameA, texts[0], registry).kind, kindOf(nameB, texts[1], registry).kind] : []), [texts, nameA, nameB]);
  const extra = kinds[0] === kinds[1] ? EXTRA[kinds[0]!] : undefined;
  const views: View[] = extra ? [extra, 'text'] : ['text'];
  const [chosen, setChosen] = useState<View>();
  const view = chosen && views.includes(chosen) ? chosen : views[0]!;

  const picker = (label: string, s: Side, set: (s: Side) => void) => (
    <label className="compare__side">
      <span className="compare__label">{label}</span>
      <span className="compare__path" title={pathOf(nodes, s.file)}>
        {pathOf(nodes, s.file)}
      </span>
      <select className="select" aria-label={`${label} version`} value={s.version ?? ''} onChange={(e) => set({ file: s.file, ...(e.target.value && { version: Number(e.target.value) }) })}>
        <option value="">Current text</option>
        {[...(versions[s.file] ?? [])].reverse().map((v) => (
          <option key={v.n} value={v.n}>
            v{v.n} · {new Date(v.at).toLocaleString()}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="frame compare">
      <div className="pane__header cluster">
        <span className="pane__title">Compare</span>
        {views.length > 1 && (
          <div className="segmented" role="group" aria-label="View">
            {views.map((v) => (
              <button key={v} type="button" className="btn" data-size="small" aria-pressed={v === view} onClick={() => setChosen(v)}>
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn push-right" data-variant="ghost" data-size="small" aria-label="Close comparison" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="compare__sides">
        {picker('Before', a, (s) => onChange({ a: s, b }))}
        <button type="button" className="btn" data-variant="ghost" data-size="small" aria-label="Swap sides" onClick={() => onChange({ a: b, b: a })}>
          ⇄
        </button>
        {picker('After', b, (s) => onChange({ a, b: s }))}
      </div>
      {!texts ? (
        <p className="text-muted text-small compare__loading">Reading…</p>
      ) : view === 'rendered' ? (
        <MarkdownDiff a={texts[0]} b={texts[1]} links={links} />
      ) : view === 'table' ? (
        <CsvDiff a={texts[0]} b={texts[1]} nameA={nameA} nameB={nameB} />
      ) : (
        <TextDiff a={texts[0]} b={texts[1]} />
      )}
    </div>
  );
}
