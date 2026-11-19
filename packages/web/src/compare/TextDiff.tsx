import { changeStarts, diffLines, diffWords, fold, type Part, type Row } from '@jtd/documents';
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * The text comparison (URS-WS-030, WS-031): side by side or as one unified list, unchanged stretches folded,
 * changed words marked inside changed lines, and next and previous change.
 */
export function TextDiff({ a, b }: { a: string; b: string }) {
  const d = useMemo(() => diffLines(a, b), [a, b]);
  const [unified, setUnified] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [at, setAt] = useState(-1);
  const host = useRef<HTMLDivElement>(null);
  const segments = useMemo(() => fold(d.rows), [d]);
  const starts = useMemo(() => changeStarts(d.rows), [d]);

  const go = (step: number) => {
    if (!starts.length) return;
    const next = (at + step + starts.length) % starts.length;
    setAt(next);
    const row = host.current?.querySelector<HTMLElement>(`[data-row="${starts[next]}"]`);
    row?.scrollIntoView({ block: 'center' });
    row?.focus({ preventScroll: true });
  };

  const line = (r: Row, i: number): ReactNode => {
    const words = r.kind === 'change' ? diffWords(d.a[r.a!]!, d.b[r.b!]!) : undefined;
    const num = (n?: number) => <td className="diff__num">{n === undefined ? '' : n + 1}</td>;
    const code = (side: 'a' | 'b', parts?: Part[]) => {
      const n = side === 'a' ? r.a : r.b;
      const text = n === undefined ? '' : (side === 'a' ? d.a : d.b)[n]!;
      const Mark = side === 'a' ? 'del' : 'ins';
      return <td className="diff__code">{parts ? parts.map((p, k) => (p.changed ? <Mark key={k}>{p.text}</Mark> : <Fragment key={k}>{p.text}</Fragment>)) : text}</td>;
    };
    const attrs = (kind: string, first: boolean) => ({ 'data-kind': kind, ...(first && i === starts[at] && { 'data-active': true }), ...(first && { 'data-row': i, tabIndex: -1 }) });
    if (!unified)
      return (
        <tr key={i} {...attrs(r.kind, true)}>
          {num(r.a)}
          {r.a === undefined ? <td className="diff__code" data-empty /> : code('a', words?.a)}
          {num(r.b)}
          {r.b === undefined ? <td className="diff__code" data-empty /> : code('b', words?.b)}
        </tr>
      );
    const one = (kind: 'same' | 'del' | 'ins', first: boolean, parts?: Part[]) => (
      <tr key={`${i}${kind}`} {...attrs(kind, first)}>
        {num(kind === 'ins' ? undefined : r.a)}
        {num(kind === 'del' ? undefined : r.b)}
        <td className="diff__sign" aria-hidden="true">
          {kind === 'del' ? '−' : kind === 'ins' ? '+' : ''}
        </td>
        {code(kind === 'ins' ? 'b' : 'a', parts)}
      </tr>
    );
    if (r.kind === 'change') return [one('del', true, words!.a), one('ins', false, words!.b)];
    return one(r.kind, true);
  };

  return (
    <div className="diff">
      <div className="diff__bar cluster">
        <span className="text-small">
          <span className="diff__count" data-kind="ins">+{d.added}</span> <span className="diff__count" data-kind="del">−{d.removed}</span>
        </span>
        <div className="segmented" role="group" aria-label="Layout">
          <button type="button" className="btn" data-size="small" aria-pressed={!unified} onClick={() => setUnified(false)}>
            Side by side
          </button>
          <button type="button" className="btn" data-size="small" aria-pressed={unified} onClick={() => setUnified(true)}>
            Unified
          </button>
        </div>
        <span className="text-muted text-small push-right" aria-live="polite">
          {starts.length ? (at < 0 ? `${starts.length} change${starts.length > 1 ? 's' : ''}` : `Change ${at + 1} of ${starts.length}`) : 'No differences'}
        </span>
        <button type="button" className="btn" data-variant="ghost" data-size="small" aria-label="Previous change" disabled={!starts.length} onClick={() => go(-1)}>
          ↑
        </button>
        <button type="button" className="btn" data-variant="ghost" data-size="small" aria-label="Next change" disabled={!starts.length} onClick={() => go(1)}>
          ↓
        </button>
      </div>
      <div className="diff__scroll" ref={host}>
        <table className="diff__table" data-layout={unified ? 'unified' : 'split'} aria-label="Text comparison">
          <tbody>
            {segments.map((s) =>
              'rows' in s || open.has(s.start) ? (
                <Fragment key={s.start}>{('rows' in s ? s.rows : d.rows.slice(s.start, s.start + s.fold)).map((r, k) => line(r, s.start + k))}</Fragment>
              ) : (
                <tr key={s.start} className="diff__fold">
                  <td colSpan={4}>
                    <button type="button" className="btn" data-variant="ghost" data-size="small" onClick={() => setOpen((o) => new Set(o).add(s.start))}>
                      Show {s.fold} unchanged lines
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
