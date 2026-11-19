import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, loadLayout, resize, saveLayout, shares, toggle, visible } from '../src/workspace/layout.ts';

/** No comparison open: the Compare pane is hidden for now, as the app does. */
const NONE = ['compare'] as const;
const close = (a: Record<string, number>, b: Record<string, number>) => Object.keys(b).forEach((k) => expect(a[k]).toBeCloseTo(b[k]!));

describe('workspace layout (URS-WEB-015, URS-WS-011)', () => {
  it('shares the width among visible panes', () => {
    close(shares(DEFAULT_LAYOUT, NONE), { files: 0.16, ai: 0.24, source: 0.26, preview: 0.34 });
    close(shares(toggle(DEFAULT_LAYOUT, 'ai'), NONE), { files: 0.16 / 0.76, source: 0.26 / 0.76, preview: 0.34 / 0.76 });
  });

  it('hides and shows panes, but never the last one', () => {
    const one = toggle(toggle(toggle(DEFAULT_LAYOUT, 'files', NONE), 'ai', NONE), 'source', NONE);
    expect(visible(one, NONE)).toEqual(['preview']);
    expect(toggle(one, 'preview', NONE)).toBe(one);
    expect(visible(toggle(one, 'ai', NONE), NONE)).toEqual(['ai', 'preview']);
  });

  it('shows the Compare pane only while a comparison is open (URS-WS-031)', () => {
    expect(visible(DEFAULT_LAYOUT)).toEqual(['files', 'ai', 'source', 'preview', 'compare']);
    close(shares(DEFAULT_LAYOUT), { compare: 0.5 / 1.5 });
    // With nothing else on screen but a closed comparison, the last pane still stays.
    const one = toggle(toggle(toggle(DEFAULT_LAYOUT, 'files', NONE), 'ai', NONE), 'source', NONE);
    expect(toggle(one, 'preview', NONE)).toBe(one);
  });

  it('hides a pane for now without touching the user’s own choice (URS-WS-011)', () => {
    expect(visible(DEFAULT_LAYOUT, ['preview', ...NONE])).toEqual(['files', 'ai', 'source']);
    close(shares(DEFAULT_LAYOUT, ['preview', ...NONE]), { files: 0.16 / 0.66, ai: 0.24 / 0.66, source: 0.26 / 0.66 });
    // When it would hide everything, it hides nothing.
    const only = { ...DEFAULT_LAYOUT, hidden: ['files', 'ai', 'source'] as const };
    expect(visible({ ...only, hidden: [...only.hidden, 'compare'] }, ['preview'])).toEqual(['preview']);
    // Resizing while a pane is hidden for now leaves its width alone.
    const l = resize(DEFAULT_LAYOUT, 'ai', 'source', 0.1, 0.1, ['preview', ...NONE]);
    expect(l.sizes[3]).toBe(0.34);
  });

  it('moves a gutter between two panes only, within the minimum', () => {
    const l = resize(DEFAULT_LAYOUT, 'ai', 'source', 0.1, 0.15, NONE);
    close(shares(l, NONE), { files: 0.16, ai: 0.34, source: 0.16, preview: 0.34 });
    close(shares(resize(DEFAULT_LAYOUT, 'ai', 'source', 0.5, 0.15, NONE), NONE), { ai: 0.35, source: 0.15, preview: 0.34 });
    close(shares(resize(toggle(DEFAULT_LAYOUT, 'source'), 'ai', 'preview', -0.1, 0.1, NONE), NONE), { ai: 0.24 / 0.74 - 0.1, preview: 0.34 / 0.74 + 0.1 });
  });

  it('remembers the layout and ignores damaged or older storage', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const l = toggle(DEFAULT_LAYOUT, 'ai');
    saveLayout(l, s);
    expect(loadLayout(s)).toEqual(l);
    // The three-pane layout of earlier releases falls back to the default.
    for (const bad of ['{', '{"sizes":[1],"hidden":[]}', '{"sizes":[0.3,0.3,0.4],"hidden":[]}', '{"sizes":[1,1,1,1],"hidden":["files","ai","source","preview"]}', '{"sizes":[1,-1,1,1],"hidden":[]}']) {
      store.set('jtd:layout', bad);
      expect(loadLayout(s)).toEqual(DEFAULT_LAYOUT);
    }
    // A four-pane layout from before Compare keeps its widths and choices.
    store.set('jtd:layout', '{"sizes":[0.1,0.2,0.3,0.4],"hidden":["ai"]}');
    expect(loadLayout(s)).toEqual({ sizes: [0.1, 0.2, 0.3, 0.4, 0.5], hidden: ['ai'] });
  });
});
