import { diffTable, parseCsv, type Separator } from '@jtd/documents';
import { useMemo, useState } from 'react';

/** Rows drawn at most; the summary still counts them all. */
const LIMIT = 2000;
const SIGN = { same: '', changed: '~', added: '+', removed: '−' } as const;

const separatorOf = (name: string): Separator | undefined => (name.toLowerCase().endsWith('.tsv') ? '\t' : undefined);

/**
 * CSV compared as a table (URS-WS-034): rows matched by a chosen key column or by position, changed cells
 * showing the old and new value, added and removed rows marked. Unchanged rows can be hidden.
 */
export function CsvDiff({ a, b, nameA, nameB }: { a: string; b: string; nameA: string; nameB: string }) {
  const ra = useMemo(() => parseCsv(a, separatorOf(nameA)).rows, [a, nameA]);
  const rb = useMemo(() => parseCsv(b, separatorOf(nameB)).rows, [b, nameB]);
  const [key, setKey] = useState('');
  const [all, setAll] = useState(false);
  const d = useMemo(() => diffTable(ra, rb, key || undefined), [ra, rb, key]);
  const keys = (rb[0] ?? []).filter((h) => (ra[0] ?? []).includes(h));
  const shown = (all ? d.rows : d.rows.filter((r) => r.kind !== 'same')).slice(0, LIMIT);

  return (
    <div className="diff">
      <div className="diff__bar cluster text-small">
        <span className="diff__count" data-kind="ins">{d.added} added</span>
        <span className="diff__count" data-kind="del">{d.removed} removed</span>
        <span className="diff__count" data-kind="change">{d.changed} changed</span>
        <label className="cluster">
          Match rows
          <select className="select" value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">by position</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                by {k}
              </option>
            ))}
          </select>
        </label>
        <label className="cluster push-right">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Unchanged rows
        </label>
      </div>
      {(d.addedColumns.length > 0 || d.removedColumns.length > 0) && (
        <p className="diff__note text-small">
          {d.addedColumns.length > 0 && <>Columns added: {d.addedColumns.join(', ')}. </>}
          {d.removedColumns.length > 0 && <>Columns removed: {d.removedColumns.join(', ')}.</>}
        </p>
      )}
      <div className="diff__scroll">
        <table className="diff__grid" aria-label="Table comparison">
          <thead>
            <tr>
              <th aria-label="Change" />
              {d.columns.map((c) => (
                <th key={c} {...(d.addedColumns.includes(c) ? { 'data-kind': 'added' } : d.removedColumns.includes(c) ? { 'data-kind': 'removed' } : {})}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} data-kind={r.kind}>
                <td className="diff__sign" aria-label={r.kind}>
                  {SIGN[r.kind]}
                </td>
                {d.columns.map((_, c) =>
                  r.kind === 'changed' && r.cells![c] ? (
                    <td key={c} data-changed>
                      <del>{r.a![c]}</del> <ins>{r.b![c]}</ins>
                    </td>
                  ) : (
                    <td key={c}>{(r.b ?? r.a)![c]}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="text-muted text-small diff__note">No differences in the rows.</p>}
        {shown.length === LIMIT && <p className="text-muted text-small diff__note">Showing the first {LIMIT} rows.</p>}
      </div>
    </div>
  );
}
