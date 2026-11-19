import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, loadLayout, resize, saveLayout, shares, toggle, visible } from '../src/workspace/layout.ts';

const close = (a: Record<string, number>, b: Record<string, number>) => Object.keys(b).forEach((k) => expect(a[k]).toBeCloseTo(b[k]!));

describe('workspace layout (URS-WEB-015, URS-WS-011)', () => {
  it('shares the width among visible panes', () => {
    close(shares(DEFAULT_LAYOUT), { files: 0.16, ai: 0.24, source: 0.26, preview: 0.34 });
    close(shares(toggle(DEFAULT_LAYOUT, 'ai')), { files: 0.16 / 0.76, source: 0.26 / 0.76, preview: 0.34 / 0.76 });
  });

  it('hides and shows panes, but never the last one', () => {
    const one = toggle(toggle(toggle(DEFAULT_LAYOUT, 'files'), 'ai'), 'source');
    expect(visible(one)).toEqual(['preview']);
    expect(toggle(one, 'preview')).toBe(one);
    expect(visible(toggle(one, 'ai'))).toEqual(['ai', 'preview']);
  });

  it('hides a pane for now without touching the user’s own choice (URS-WS-011)', () => {
    expect(visible(DEFAULT_LAYOUT, ['preview'])).toEqual(['files', 'ai', 'source']);
    close(shares(DEFAULT_LAYOUT, ['preview']), { files: 0.16 / 0.66, ai: 0.24 / 0.66, source: 0.26 / 0.66 });
    // When it would hide everything, it hides nothing.
    const only = { ...DEFAULT_LAYOUT, hidden: ['files', 'ai', 'source'] as const };
    expect(visible({ ...only, hidden: [...only.hidden] }, ['preview'])).toEqual(['preview']);
    // Resizing while a pane is hidden for now leaves its width alone.
    const l = resize(DEFAULT_LAYOUT, 'ai', 'source', 0.1, 0.1, ['preview']);
    expect(l.sizes[3]).toBe(0.34);
  });

  it('moves a gutter between two panes only, within the minimum', () => {
    const l = resize(DEFAULT_LAYOUT, 'ai', 'source', 0.1, 0.15);
    close(shares(l), { files: 0.16, ai: 0.34, source: 0.16, preview: 0.34 });
    close(shares(resize(DEFAULT_LAYOUT, 'ai', 'source', 0.5, 0.15)), { ai: 0.35, source: 0.15, preview: 0.34 });
    close(shares(resize(toggle(DEFAULT_LAYOUT, 'source'), 'ai', 'preview', -0.1, 0.1)), { ai: 0.24 / 0.74 - 0.1, preview: 0.34 / 0.74 + 0.1 });
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
  });
});
