import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, loadLayout, resize, saveLayout, shares, toggle, visible } from '../src/workspace/layout.ts';

const close = (a: Record<string, number>, b: Record<string, number>) => Object.keys(b).forEach((k) => expect(a[k]).toBeCloseTo(b[k]!));

describe('workspace layout (URS-WEB-015)', () => {
  it('shares the width among visible panes', () => {
    close(shares(DEFAULT_LAYOUT), { ai: 0.28, source: 0.3, diagram: 0.42 });
    close(shares(toggle(DEFAULT_LAYOUT, 'ai')), { source: 0.3 / 0.72, diagram: 0.42 / 0.72 });
  });

  it('hides and shows panes, but never the last one', () => {
    const one = toggle(toggle(DEFAULT_LAYOUT, 'ai'), 'source');
    expect(visible(one)).toEqual(['diagram']);
    expect(toggle(one, 'diagram')).toBe(one);
    expect(visible(toggle(one, 'ai'))).toEqual(['ai', 'diagram']);
  });

  it('moves a gutter between two panes only, within the minimum', () => {
    const l = resize(DEFAULT_LAYOUT, 'ai', 'source', 0.1, 0.15);
    close(shares(l), { ai: 0.38, source: 0.2, diagram: 0.42 });
    close(shares(resize(DEFAULT_LAYOUT, 'ai', 'source', 0.5, 0.15)), { ai: 0.43, source: 0.15, diagram: 0.42 });
    close(shares(resize(toggle(DEFAULT_LAYOUT, 'source'), 'ai', 'diagram', -0.1, 0.1)), { ai: 0.28 / 0.7 - 0.1, diagram: 0.42 / 0.7 + 0.1 });
  });

  it('remembers the layout and ignores damaged storage', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const l = toggle(DEFAULT_LAYOUT, 'ai');
    saveLayout(l, s);
    expect(loadLayout(s)).toEqual(l);
    for (const bad of ['{', '{"sizes":[1],"hidden":[]}', '{"sizes":[1,1,1],"hidden":["ai","source","diagram"]}', '{"sizes":[1,-1,1],"hidden":[]}']) {
      store.set('jtd:layout', bad);
      expect(loadLayout(s)).toEqual(DEFAULT_LAYOUT);
    }
  });
});
