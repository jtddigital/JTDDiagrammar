import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, dock, loadLayout, nudge, resize, saveLayout, shown, toggle, visible, type Layout, type PaneId } from '../src/workspace/layout.ts';

/** No comparison open: the Compare pane is hidden for now, as the app does. */
const NONE: PaneId[] = ['compare'];
const close = (a: number, b: number) => expect(a).toBeCloseTo(b);
const widths = (l: Layout, auto: readonly PaneId[] = NONE) => Object.fromEntries(shown(l, auto).map((c) => [c.panes.join('+'), c.width]));
const columns = (l: Layout, auto: readonly PaneId[] = NONE) => shown(l, auto).map((c) => c.panes);

describe('workspace layout (URS-WEB-015, URS-WS-011)', () => {
  it('shares the width among visible columns', () => {
    const w = widths(DEFAULT_LAYOUT);
    close(w.files!, 0.16);
    close(w.preview!, 0.34);
    close(widths(toggle(DEFAULT_LAYOUT, 'ai', NONE)).files!, 0.16 / 0.76);
  });

  it('hides and shows panes, but never the last one', () => {
    const one = toggle(toggle(toggle(DEFAULT_LAYOUT, 'files', NONE), 'ai', NONE), 'source', NONE);
    expect(visible(one, NONE)).toEqual(['preview']);
    expect(toggle(one, 'preview', NONE)).toBe(one);
    expect(visible(toggle(one, 'ai', NONE), NONE)).toEqual(['ai', 'preview']);
  });

  it('shows the Compare pane only while a comparison is open (URS-WS-031)', () => {
    expect(visible(DEFAULT_LAYOUT)).toEqual(['files', 'ai', 'source', 'preview', 'compare']);
    close(widths(DEFAULT_LAYOUT, []).compare!, 0.5 / 1.5);
  });

  it('hides a pane for now without touching the user’s own choice (URS-WS-011)', () => {
    expect(visible(DEFAULT_LAYOUT, ['preview', ...NONE])).toEqual(['files', 'ai', 'source']);
    close(widths(DEFAULT_LAYOUT, ['preview', ...NONE]).ai!, 0.24 / 0.66);
    // When it would hide everything, it hides nothing.
    const only: Layout = { ...DEFAULT_LAYOUT, hidden: ['files', 'ai', 'source', 'details', 'compare'] };
    expect(visible(only, ['preview'])).toEqual(['preview']);
  });

  it('moves a gutter between two columns only, within the minimum', () => {
    const w = widths(resize(DEFAULT_LAYOUT, 'ai', 'source', 0.1, 0.15, NONE));
    close(w.ai!, 0.34);
    close(w.source!, 0.16);
    close(w.preview!, 0.34);
    close(widths(resize(DEFAULT_LAYOUT, 'ai', 'source', 0.5, 0.15, NONE)).source!, 0.15);
  });
});

describe('docking panes (URS-WEB-024)', () => {
  it('stacks a pane above or below another in its column, each taking half its height', () => {
    const l = dock(DEFAULT_LAYOUT, 'files', 'source', 'bottom');
    expect(columns(l)).toEqual([['ai'], ['source', 'files'], ['preview']]);
    expect(shown(l, NONE)[1]!.heights).toEqual([0.5, 0.5]);
    // Its old column is gone; the others share the width.
    close(widths(l)['source+files']!, 0.26 / 0.84);
    expect(columns(dock(l, 'ai', 'files', 'top'))).toEqual([['source', 'ai', 'files'], ['preview']]);
  });

  it('docks a pane beside another as a column of its own, halving that column', () => {
    const l = dock(dock(DEFAULT_LAYOUT, 'files', 'source', 'bottom'), 'files', 'preview', 'right');
    expect(columns(l)).toEqual([['ai'], ['source'], ['preview'], ['files']]);
    close(widths(l).preview!, widths(l).files!);
    expect(columns(dock(l, 'files', 'ai', 'left'))[0]).toEqual(['files']);
    expect(dock(l, 'files', 'files', 'left')).toBe(l);
  });

  it('moves panes from the keyboard: up and down in a column, out to a column, into the next one', () => {
    const stacked = dock(DEFAULT_LAYOUT, 'files', 'source', 'bottom');
    expect(columns(nudge(stacked, 'files', 'top', NONE))).toEqual([['ai'], ['files', 'source'], ['preview']]);
    expect(columns(nudge(stacked, 'files', 'right', NONE))).toEqual([['ai'], ['source'], ['files'], ['preview']]);
    expect(columns(nudge(DEFAULT_LAYOUT, 'ai', 'right', NONE))).toEqual([['files'], ['source', 'ai'], ['preview']]);
    // At an edge nothing moves.
    expect(nudge(DEFAULT_LAYOUT, 'files', 'left', NONE)).toBe(DEFAULT_LAYOUT);
    expect(nudge(DEFAULT_LAYOUT, 'files', 'top', NONE)).toBe(DEFAULT_LAYOUT);
  });

  it('resizes stacked panes within their column only', () => {
    const l = resize(dock(DEFAULT_LAYOUT, 'files', 'source', 'bottom'), 'source', 'files', 0.2, 0.1, NONE, 'rows');
    expect(shown(l, NONE)[1]!.heights.map((h) => Math.round(h * 100))).toEqual([70, 30]);
    close(widths(l)['source+files']!, 0.26 / 0.84);
    // A hidden pane in the column keeps its share for when it returns.
    const hidden = toggle(l, 'files', NONE);
    expect(shown(hidden, NONE)[1]!.heights).toEqual([1]);
    expect(shown(toggle(hidden, 'files', NONE), NONE)[1]!.heights.map((h) => Math.round(h * 100))).toEqual([70, 30]);
  });
});

describe('remembering the layout', () => {
  const store = new Map<string, string>();
  const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };

  it('saves and loads it, ignoring damaged storage', () => {
    const l = dock(toggle(DEFAULT_LAYOUT, 'ai'), 'files', 'source', 'top');
    saveLayout(l, s);
    expect(loadLayout(s)).toEqual(l);
    for (const bad of ['{', '{"columns":[],"hidden":[]}', '{"sizes":[0.3,0.3,0.4],"hidden":[]}', JSON.stringify({ ...DEFAULT_LAYOUT, hidden: ['files', 'ai', 'source', 'preview', 'details'] }), JSON.stringify({ columns: DEFAULT_LAYOUT.columns.slice(1), hidden: [] })]) {
      store.set('jtd:layout', bad);
      expect(loadLayout(s)).toEqual(DEFAULT_LAYOUT);
    }
  });

  it('upgrades a layout from before columns, keeping widths and choices', () => {
    store.set('jtd:layout', '{"sizes":[0.1,0.2,0.3,0.4],"hidden":["ai"]}');
    const l = loadLayout(s);
    expect(l.hidden).toEqual(['ai', 'details']);
    expect(l.columns.map((c) => [c.panes, c.size])).toEqual([
      [['files'], 0.1],
      [['ai'], 0.2],
      [['source'], 0.3],
      [['preview', 'details'], 0.4],
      [['compare'], 0.5],
    ]);
    store.set('jtd:layout', '{"sizes":[0.1,0.2,0.3,0.4,0.6],"hidden":[]}');
    expect(loadLayout(s).columns[4]!.size).toBe(0.6);
  });

  it('adds the Details pane to a layout saved before it, under Preview and hidden (D-009)', () => {
    const before = { columns: [{ panes: ['files', 'source'], size: 0.4, heights: [0.5, 0.5] }, { panes: ['ai'], size: 0.2, heights: [1] }, { panes: ['preview'], size: 0.4, heights: [1] }, { panes: ['compare'], size: 0.5, heights: [1] }], hidden: [] };
    store.set('jtd:layout', JSON.stringify(before));
    const l = loadLayout(s);
    expect(l.columns.map((c) => c.panes)).toEqual([['files', 'source'], ['ai'], ['preview', 'details'], ['compare']]);
    expect(l.hidden).toEqual(['details']);
    expect(visible(l, NONE)).toEqual(['files', 'source', 'ai', 'preview']);
  });
});
