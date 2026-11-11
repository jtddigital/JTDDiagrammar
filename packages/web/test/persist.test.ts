import { describe, expect, it } from 'vitest';
import { decode, encode } from '../src/persist.ts';
import { examples, pretty } from '../src/registry.ts';

describe('share links (URS-WEB-008)', () => {
  it('round-trips source through a compact, URL-safe encoding', async () => {
    for (const ex of examples) {
      const text = pretty(ex.source);
      const s = await encode(text);
      expect(s).toMatch(/^[\w-]+$/);
      expect(s.length).toBeLessThan(text.length);
      expect(await decode(s)).toBe(text);
    }
    expect(await decode(await encode('ünïcødé ✓'))).toBe('ünïcødé ✓');
  });

  it('rejects a damaged link', async () => {
    await expect(decode('not-deflate')).rejects.toThrow();
  });
});
