import { numeric, parseCsv, type Separator } from '@jtd/documents';
import { useDeferredValue, useMemo, useRef, useState, type UIEvent } from 'react';

const ROW = 28;
const OVERSCAN = 12;
/** Problems listed above the table; the rest are counted. */
const SHOWN = 5;

type Sort = { col: number; dir: 1 | -1 } | undefined;

/**
 * A CSV file as a table (URS-WS-012, WS-013): header row, row numbers, sticky header, numbers aligned right,
 * only the rows in view drawn, so large files scroll smoothly. Clicking a header sorts the view (ascending,
 * descending, then as in the file); the file never changes. Problems are listed at their lines.
 */
export function CsvTable({ text, name }: { text: string; name: string }) {
  const deferred = useDeferredValue(text);
  const separator: Separator | undefined = name.toLowerCase().endsWith('.tsv') ? '\t' : undefined;
  const csv = useMemo(() => parseCsv(deferred, separator), [deferred, separator]);
  const [sort, setSort] = useState<Sort>();
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  const host = useRef<HTMLDivElement>(null);

  const [header = [], ...body] = csv.rows;
  const width = Math.max(header.length, ...body.slice(0, 200).map((r) => r.length));
  // A column is numeric when most of its filled cells (in a sample) are numbers.
  const isNumber = useMemo(
    () =>
      Array.from({ length: width }, (_, c) => {
        const cells = body.slice(0, 500).map((r) => r[c] ?? '').filter((s) => s.trim());
        return cells.length > 0 && cells.filter(numeric).length / cells.length >= 0.8;
      }),
    // `body` changes with `csv`.
    [csv, width],
  );
  const widths = useMemo(
    // Wide enough for the header in bold with its sort mark, and for most cells, within limits.
    () => Array.from({ length: width }, (_, c) => Math.min(320, Math.max(64, 32 + 8.5 * (header[c] ?? '').length, 16 + 7.5 * Math.max(0, ...body.slice(0, 200).map((r) => Math.min(40, (r[c] ?? '').length)))))),
    [csv, width],
  );
  const order = useMemo(() => {
    const idx = body.map((_, i) => i);
    if (!sort) return idx;
    const key = (i: number) => body[i]![sort.col] ?? '';
    const num = (s: string) => Number(s.replace(/[,%\s]/g, ''));
    const cmp = isNumber[sort.col] ? (a: number, b: number) => (num(key(a)) || 0) - (num(key(b)) || 0) : (a: number, b: number) => key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: 'base' });
    return idx.sort((a, b) => cmp(a, b) * sort.dir || a - b);
  }, [csv, sort, isNumber]);

  // The row number column fits the largest number.
  const numWidth = 20 + 8 * String(body.length).length;
  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(order.length, Math.ceil((top + height) / ROW) + OVERSCAN);
  const scroll = (e: UIEvent<HTMLDivElement>) => {
    setTop(e.currentTarget.scrollTop);
    setHeight(e.currentTarget.clientHeight);
  };
  const cycle = (col: number) => setSort((s) => (s?.col !== col ? { col, dir: 1 } : s.dir === 1 ? { col, dir: -1 } : undefined));

  return (
    <div className="csv">
      <p className="csv__summary text-small text-muted">
        {body.length.toLocaleString()} row{body.length === 1 ? '' : 's'} · {width} column{width === 1 ? '' : 's'} · separated by {csv.separator === '\t' ? 'tabs' : csv.separator === ';' ? 'semicolons' : 'commas'}
        {sort && ' · sorted view'}
      </p>
      {csv.problems.length > 0 && (
        <ul className="csv__problems text-small" aria-label="Problems">
          {csv.problems.slice(0, SHOWN).map((p, i) => (
            <li key={i}>
              Line {p.line}: {p.message}
            </li>
          ))}
          {csv.problems.length > SHOWN && <li>and {csv.problems.length - SHOWN} more</li>}
        </ul>
      )}
      <div className="csv__scroll" ref={host} onScroll={scroll} tabIndex={0} aria-label="Table">
        <table className="csv__table" aria-rowcount={body.length + 1} style={{ width: numWidth + widths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            <col style={{ width: numWidth }} />
            {widths.map((w, c) => (
              <col key={c} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr aria-rowindex={1}>
              <th scope="col" className="csv__num">
                #
              </th>
              {Array.from({ length: width }, (_, c) => (
                <th key={c} scope="col" aria-sort={sort?.col === c ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} data-number={isNumber[c] || undefined}>
                  <button type="button" onClick={() => cycle(c)} title="Sort the view by this column">
                    {header[c] ?? ''}
                    <span aria-hidden="true">{sort?.col === c ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 && <tr style={{ height: first * ROW }} aria-hidden="true" />}
            {order.slice(first, last).map((i) => (
              <tr key={i} aria-rowindex={i + 2}>
                <td className="csv__num">{i + 1}</td>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} data-number={isNumber[c] || undefined} title={body[i]![c]}>
                    {body[i]![c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
            {last < order.length && <tr style={{ height: (order.length - last) * ROW }} aria-hidden="true" />}
          </tbody>
        </table>
      </div>
    </div>
  );
}
