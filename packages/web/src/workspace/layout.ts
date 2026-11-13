/** Three-pane workspace layout: widths and visibility (URS-WEB-015). Pure, so it is unit-tested. */
export const PANES = ['ai', 'source', 'diagram'] as const;
export type PaneId = (typeof PANES)[number];

export interface Layout {
  /** Share of the width per pane, in PANES order; hidden panes keep theirs for when they return. */
  sizes: number[];
  hidden: PaneId[];
}

export const DEFAULT_LAYOUT: Layout = { sizes: [0.28, 0.3, 0.42], hidden: [] };
const KEY = 'jtd:layout';

export const visible = (l: Layout): PaneId[] => PANES.filter((p) => !l.hidden.includes(p));

/** Widths of the visible panes, scaled to sum to 1. */
export function shares(l: Layout): Record<string, number> {
  const ids = visible(l);
  const total = ids.reduce((s, p) => s + l.sizes[PANES.indexOf(p)]!, 0);
  return Object.fromEntries(ids.map((p) => [p, l.sizes[PANES.indexOf(p)]! / total]));
}

/** Show or hide a pane; the last visible pane stays. */
export function toggle(l: Layout, p: PaneId): Layout {
  if (l.hidden.includes(p)) return { ...l, hidden: l.hidden.filter((h) => h !== p) };
  return visible(l).length > 1 ? { ...l, hidden: [...l.hidden, p] } : l;
}

/**
 * Move the gutter between visible panes `a` and `b` by `delta` (a share of the visible width),
 * keeping both at least `min`. Only those two change.
 */
export function resize(l: Layout, a: PaneId, b: PaneId, delta: number, min: number): Layout {
  const s = shares(l);
  const pair = s[a]! + s[b]!;
  const na = Math.min(pair - min, Math.max(min, s[a]! + delta));
  const scale = Object.values(l.sizes).reduce((t, x, i) => t + (l.hidden.includes(PANES[i]!) ? 0 : x), 0);
  const sizes = [...l.sizes];
  sizes[PANES.indexOf(a)] = na * scale;
  sizes[PANES.indexOf(b)] = (pair - na) * scale;
  return { ...l, sizes };
}

const valid = (v: unknown): v is Layout => {
  const l = v as Layout;
  return Array.isArray(l?.sizes) && l.sizes.length === PANES.length && l.sizes.every((x) => typeof x === 'number' && x > 0) && Array.isArray(l.hidden) && l.hidden.every((h) => PANES.includes(h)) && l.hidden.length < PANES.length;
};

export function loadLayout(storage: Pick<Storage, 'getItem'> = localStorage): Layout {
  try {
    const v: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
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
