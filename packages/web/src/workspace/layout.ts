/** Workspace layout: pane widths and visibility (URS-WEB-015). Pure, so it is unit-tested. */
export const PANES = ['files', 'ai', 'source', 'preview'] as const;
export type PaneId = (typeof PANES)[number];

export interface Layout {
  /** Share of the width per pane, in PANES order; hidden panes keep theirs for when they return. */
  sizes: number[];
  hidden: PaneId[];
}

export const DEFAULT_LAYOUT: Layout = { sizes: [0.16, 0.24, 0.26, 0.34], hidden: [] };
const KEY = 'jtd:layout';

/**
 * Visible panes: not hidden by the user, nor hidden for now by what is open (`auto`, e.g. Preview for a text
 * file, URS-WS-011), which is kept apart so the user's own choice returns unchanged. One pane always shows.
 */
export function visible(l: Layout, auto: readonly PaneId[] = []): PaneId[] {
  const mine = PANES.filter((p) => !l.hidden.includes(p));
  const shown = mine.filter((p) => !auto.includes(p));
  return shown.length ? shown : mine;
}

/** Widths of the visible panes, scaled to sum to 1. */
export function shares(l: Layout, auto: readonly PaneId[] = []): Record<string, number> {
  const ids = visible(l, auto);
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
export function resize(l: Layout, a: PaneId, b: PaneId, delta: number, min: number, auto: readonly PaneId[] = []): Layout {
  const s = shares(l, auto);
  const pair = s[a]! + s[b]!;
  const na = Math.min(pair - min, Math.max(min, s[a]! + delta));
  const shown = visible(l, auto);
  const scale = l.sizes.reduce((t, x, i) => t + (shown.includes(PANES[i]!) ? x : 0), 0);
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
