/** Line comparison (URS-WS-030): the edit script as rows for display, changed lines paired, unchanged stretches folded. */
import { diff, type Op } from './myers.ts';

/** Lines of a text; a final line break ends the last line rather than starting an empty one. */
export const splitLines = (text: string): string[] => (text ? text.replace(/\r?\n$/, '').split(/\r?\n/) : []);

/**
 * One display row. `same` and `change` have a line on both sides (`change` pairs a removed line with
 * the added line in the same place); `del` only in the old text, `ins` only in the new. Line numbers count from 0.
 */
export interface Row {
  kind: 'same' | 'change' | 'del' | 'ins';
  a?: number;
  b?: number;
}

export interface LineDiff {
  a: string[];
  b: string[];
  rows: Row[];
  added: number;
  removed: number;
}

/** Rows from an edit script; removals and additions in the same place pair up in order. */
export function rows(ops: readonly Op[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (op.type === 'same') {
      for (let j = 0; j < op.n; j++) out.push({ kind: 'same', a: op.a + j, b: op.b + j });
    } else if (op.type === 'ins') {
      for (let j = 0; j < op.n; j++) out.push({ kind: 'ins', b: op.b + j });
    } else {
      const next = ops[i + 1]?.type === 'ins' ? ops[++i]! : undefined;
      const paired = Math.min(op.n, next?.n ?? 0);
      for (let j = 0; j < paired; j++) out.push({ kind: 'change', a: op.a + j, b: next!.b + j });
      for (let j = paired; j < op.n; j++) out.push({ kind: 'del', a: op.a + j });
      for (let j = paired; j < (next?.n ?? 0); j++) out.push({ kind: 'ins', b: next!.b + j });
    }
  }
  return out;
}

export function diffLines(oldText: string, newText: string): LineDiff {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const ops = diff(a, b);
  let added = 0, removed = 0;
  for (const op of ops) {
    if (op.type === 'ins') added += op.n;
    if (op.type === 'del') removed += op.n;
  }
  return { a, b, rows: rows(ops), added, removed };
}

/** A run of display rows, or a folded stretch of `count` unchanged rows starting at row `start`. */
export type Segment = { rows: Row[]; start: number } | { fold: number; start: number };

/** Fold unchanged stretches, keeping `context` rows next to each change. Short folds are not worth it. */
export function fold(all: readonly Row[], context = 3): Segment[] {
  const keep = all.map(() => false);
  all.forEach((r, i) => {
    if (r.kind === 'same') return;
    for (let j = Math.max(0, i - context); j <= Math.min(all.length - 1, i + context); j++) keep[j] = true;
  });
  const out: Segment[] = [];
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && keep[j] === keep[i]) j++;
    const last = out[out.length - 1];
    if (!keep[i] && j - i >= 2) out.push({ fold: j - i, start: i });
    else if (last && 'rows' in last) last.rows.push(...all.slice(i, j));
    else out.push({ rows: all.slice(i, j), start: i });
    i = j;
  }
  return out;
}

/** Indices of the rows that start a change, for next and previous. */
export function changeStarts(all: readonly Row[]): number[] {
  return all.flatMap((r, i) => (r.kind !== 'same' && (i === 0 || all[i - 1]!.kind === 'same') ? [i] : []));
}
