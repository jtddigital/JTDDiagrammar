/**
 * CSV compared as a table (URS-WS-034). Columns match by header name. Rows match by a key column's value,
 * or by position: the line diff over whole rows, with rows changed in place paired up.
 */
import { diff } from './myers.ts';

export interface TableRow {
  kind: 'same' | 'changed' | 'added' | 'removed';
  /** Cells in the order of `columns`; absent on the side the row is missing from. */
  a?: string[];
  b?: string[];
  /** For a changed row, which columns differ. */
  cells?: boolean[];
}

export interface TableDiff {
  columns: string[];
  /** Columns only in the old table, or only in the new one. */
  removedColumns: string[];
  addedColumns: string[];
  rows: TableRow[];
  added: number;
  removed: number;
  changed: number;
}

/**
 * Compare two tables whose first row is the header. With `key` (a column name present in both), rows with
 * the same key are the same row; without it, rows line up by position.
 */
export function diffTable(oldRows: readonly string[][], newRows: readonly string[][], key?: string): TableDiff {
  const ha = oldRows[0] ?? [];
  const hb = newRows[0] ?? [];
  const columns = [...hb, ...ha.filter((h) => !hb.includes(h))];
  const pick = (header: readonly string[], row: readonly string[]) => {
    const at = new Map(header.map((h, i) => [h, i] as const));
    return columns.map((c) => (at.has(c) ? (row[at.get(c)!] ?? '') : ''));
  };
  const A = oldRows.slice(1).map((r) => pick(ha, r));
  const B = newRows.slice(1).map((r) => pick(hb, r));
  const k = key === undefined ? -1 : columns.indexOf(key);
  const id = k < 0 ? (r: string[]) => JSON.stringify(r) : (r: string[]) => r[k];

  const out: TableDiff = {
    columns,
    removedColumns: ha.filter((h) => !hb.includes(h)),
    addedColumns: hb.filter((h) => !ha.includes(h)),
    rows: [],
    added: 0,
    removed: 0,
    changed: 0,
  };
  const compare = (a: string[], b: string[]) => {
    const cells = a.map((v, i) => v !== b[i]);
    if (cells.some(Boolean)) {
      out.rows.push({ kind: 'changed', a, b, cells });
      out.changed++;
    } else out.rows.push({ kind: 'same', a, b });
  };
  const ops = diff(A, B, id);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (op.type === 'same') {
      for (let j = 0; j < op.n; j++) compare(A[op.a + j]!, B[op.b + j]!);
      continue;
    }
    const del = op.type === 'del' ? A.slice(op.a, op.a + op.n) : [];
    const insOp = op.type === 'ins' ? op : ops[i + 1]?.type === 'ins' ? ops[++i]! : undefined;
    const ins = insOp ? B.slice(insOp.b, insOp.b + insOp.n) : [];
    // By position, a row replaced in place is that row changed; by key, a new key is a new row.
    const paired = k < 0 ? Math.min(del.length, ins.length) : 0;
    for (let j = 0; j < paired; j++) compare(del[j]!, ins[j]!);
    for (const a of del.slice(paired)) out.rows.push({ kind: 'removed', a });
    for (const b of ins.slice(paired)) out.rows.push({ kind: 'added', b });
    out.removed += del.length - paired;
    out.added += ins.length - paired;
  }
  return out;
}
