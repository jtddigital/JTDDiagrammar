/**
 * Workspace layout (URS-WEB-015, WEB-024): columns of panes stacked top to bottom, each column and each pane in
 * it with a share of the space, and which panes are hidden. Panes are docked by dragging (or Alt+Shift+arrows):
 * beside another pane as a new column, or above or below it in its column. Pure, so it is unit-tested.
 */
export const PANES = ['files', 'ai', 'source', 'preview', 'compare'] as const;
export type PaneId = (typeof PANES)[number];
export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Column {
  panes: PaneId[];
  /** Share of the width; hidden columns keep theirs for when they return. */
  size: number;
  /** Share of the column's height per pane, in `panes` order. */
  heights: number[];
}

export interface Layout {
  columns: Column[];
  hidden: PaneId[];
}

/** What shows: columns with at least one pane on screen, with their shares of width and height scaled to 1. */
export interface Shown {
  panes: PaneId[];
  width: number;
  heights: number[];
}

export const DEFAULT_LAYOUT: Layout = {
  columns: [
    { panes: ['files'], size: 0.16, heights: [1] },
    { panes: ['ai'], size: 0.24, heights: [1] },
    { panes: ['source'], size: 0.26, heights: [1] },
    { panes: ['preview'], size: 0.34, heights: [1] },
    { panes: ['compare'], size: 0.5, heights: [1] },
  ],
  hidden: [],
};
const KEY = 'jtd:layout';

/**
 * Panes not hidden by the user, nor hidden for now by what is open (`auto`, e.g. Preview for a text file,
 * URS-WS-011), which is kept apart so the user's own choice returns unchanged. One pane always shows.
 */
export function visible(l: Layout, auto: readonly PaneId[] = []): PaneId[] {
  const all = l.columns.flatMap((c) => c.panes);
  const mine = all.filter((p) => !l.hidden.includes(p));
  const shown = mine.filter((p) => !auto.includes(p));
  return shown.length ? shown : mine;
}

/** The columns on screen, left to right, each with its panes top to bottom. */
export function shown(l: Layout, auto: readonly PaneId[] = []): Shown[] {
  const on = visible(l, auto);
  const cols = l.columns
    .map((c) => {
      const idx = c.panes.flatMap((p, i) => (on.includes(p) ? [i] : []));
      const total = idx.reduce((s, i) => s + c.heights[i]!, 0);
      return { panes: idx.map((i) => c.panes[i]!), size: c.size, heights: idx.map((i) => c.heights[i]! / total) };
    })
    .filter((c) => c.panes.length);
  const width = cols.reduce((s, c) => s + c.size, 0);
  return cols.map((c) => ({ panes: c.panes, width: c.size / width, heights: c.heights }));
}

/** Show or hide a pane; the last pane on screen stays. */
export function toggle(l: Layout, p: PaneId, auto: readonly PaneId[] = []): Layout {
  if (l.hidden.includes(p)) return { ...l, hidden: l.hidden.filter((h) => h !== p) };
  return visible(l, auto).filter((x) => x !== p).length > 0 ? { ...l, hidden: [...l.hidden, p] } : l;
}

const where = (l: Layout, p: PaneId) => {
  const c = l.columns.findIndex((col) => col.panes.includes(p));
  return { c, i: l.columns[c]!.panes.indexOf(p) };
};

/** The layout without `p`: its column closes when it was alone there, and the others share the space. */
function without(l: Layout, p: PaneId): Layout {
  const { c, i } = where(l, p);
  const col = l.columns[c]!;
  if (col.panes.length === 1) return { ...l, columns: l.columns.filter((_, k) => k !== c) };
  const next = { panes: col.panes.filter((_, k) => k !== i), size: col.size, heights: col.heights.filter((_, k) => k !== i) };
  return { ...l, columns: l.columns.map((x, k) => (k === c ? next : x)) };
}

/**
 * Dock `p` beside `target`: on its left or right as a column of its own, or above or below it in its column.
 * Each takes half of the space `target` had.
 */
export function dock(l: Layout, p: PaneId, target: PaneId, side: Side): Layout {
  if (p === target) return l;
  const rest = without(l, p);
  const { c, i } = where(rest, target);
  const col = rest.columns[c]!;
  if (side === 'left' || side === 'right') {
    const half = col.size / 2;
    const cols = rest.columns.map((x, k) => (k === c ? { ...x, size: half } : x));
    cols.splice(side === 'left' ? c : c + 1, 0, { panes: [p], size: half, heights: [1] });
    return { ...rest, columns: cols };
  }
  const half = col.heights[i]! / 2;
  const at = side === 'top' ? i : i + 1;
  const panes = [...col.panes];
  const heights = col.heights.map((h, k) => (k === i ? half : h));
  panes.splice(at, 0, p);
  heights.splice(at, 0, half);
  return { ...rest, columns: rest.columns.map((x, k) => (k === c ? { ...x, panes, heights } : x)) };
}

/**
 * Move a pane from the keyboard (Alt+Shift+arrow): up or down past its neighbour in the column; left or right,
 * out of a shared column into a column of its own, or from a column of its own to the bottom of the next one.
 */
export function nudge(l: Layout, p: PaneId, dir: Side, auto: readonly PaneId[] = []): Layout {
  const on = shown(l, auto);
  const c = on.findIndex((col) => col.panes.includes(p));
  if (c < 0) return l;
  const col = on[c]!;
  const i = col.panes.indexOf(p);
  if (dir === 'top' || dir === 'bottom') {
    const other = col.panes[dir === 'top' ? i - 1 : i + 1];
    return other ? dock(l, p, other, dir) : l;
  }
  if (col.panes.length > 1) return dock(l, p, col.panes.find((x) => x !== p)!, dir);
  const next = on[dir === 'left' ? c - 1 : c + 1];
  return next ? dock(l, p, next.panes.at(-1)!, 'bottom') : l;
}

/**
 * Move the gutter between two adjacent items by `delta`, a share of the space they are drawn in, keeping both at
 * least `min`. Only those two change. Items are columns (`kind: 'columns'`), or panes in the column holding `a`.
 */
export function resize(l: Layout, a: PaneId, b: PaneId, delta: number, min: number, auto: readonly PaneId[] = [], kind: 'columns' | 'rows' = 'columns'): Layout {
  const on = shown(l, auto);
  if (kind === 'columns') {
    const [ca, cb] = [on.find((c) => c.panes.includes(a))!, on.find((c) => c.panes.includes(b))!];
    const pair = ca.width + cb.width;
    const na = Math.min(pair - min, Math.max(min, ca.width + delta));
    const shownSizes = l.columns.filter((c) => c.panes.some((p) => on.some((s) => s.panes.includes(p))));
    const scale = shownSizes.reduce((s, c) => s + c.size, 0);
    return {
      ...l,
      columns: l.columns.map((c) => (c.panes.includes(a) ? { ...c, size: na * scale } : c.panes.includes(b) ? { ...c, size: (pair - na) * scale } : c)),
    };
  }
  const s = on.find((c) => c.panes.includes(a))!;
  const [ha, hb] = [s.heights[s.panes.indexOf(a)]!, s.heights[s.panes.indexOf(b)]!];
  const pair = ha + hb;
  const na = Math.min(pair - min, Math.max(min, ha + delta));
  const { c } = where(l, a);
  const col = l.columns[c]!;
  const scale = col.panes.reduce((t, p, k) => t + (s.panes.includes(p) ? col.heights[k]! : 0), 0);
  const heights = col.panes.map((p, k) => (p === a ? na * scale : p === b ? (pair - na) * scale : col.heights[k]!));
  return { ...l, columns: l.columns.map((x, k) => (k === c ? { ...x, heights } : x)) };
}

/** A layout saved before columns existed: each pane its own column, widths kept; Compare added when missing. */
function upgrade(v: unknown): unknown {
  const old = v as { sizes?: unknown; hidden?: unknown };
  if (!Array.isArray(old?.sizes) || !old.sizes.every((x) => typeof x === 'number' && x > 0)) return v;
  const sizes = [...(old.sizes as number[])];
  if (sizes.length === PANES.length - 1) sizes.push(0.5);
  if (sizes.length !== PANES.length) return v;
  return { columns: PANES.map((p, i) => ({ panes: [p], size: sizes[i]!, heights: [1] })), hidden: old.hidden };
}

const valid = (v: unknown): v is Layout => {
  const l = v as Layout;
  if (!Array.isArray(l?.columns) || !Array.isArray(l.hidden) || !l.hidden.every((h) => PANES.includes(h))) return false;
  const ok = l.columns.every((c) => Array.isArray(c?.panes) && c.panes.length > 0 && typeof c.size === 'number' && c.size > 0 && Array.isArray(c.heights) && c.heights.length === c.panes.length && c.heights.every((h) => typeof h === 'number' && h > 0));
  const all = ok ? l.columns.flatMap((c) => c.panes) : [];
  return ok && all.length === PANES.length && PANES.every((p) => all.includes(p)) && PANES.some((p) => p !== 'compare' && !l.hidden.includes(p));
};

export function loadLayout(storage: Pick<Storage, 'getItem'> = localStorage): Layout {
  try {
    const v: unknown = upgrade(JSON.parse(storage.getItem(KEY) ?? 'null'));
    return valid(v) ? v : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: Layout, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* Best-effort. */
  }
}
