import { describe, expect, it } from 'vitest';
import { FLOWCHART_SHAPES } from '../src/diagrams/flowchart/model.ts';
import { SHAPES } from '../src/shapes/library.ts';
import { MIN_H, type Side } from '../src/shapes/shape.ts';

const sides: Side[] = ['N', 'E', 'S', 'W'];

describe('shape library (URS-DM-004, URS-TYP-001)', () => {
  it('implements every flowchart shape', () => {
    for (const s of FLOWCHART_SHAPES) expect(SHAPES.has(s), s).toBe(true);
  });

  it.each([...SHAPES.values()])('$id: sizes cover the text and ports stay on the box', (s) => {
    const { w, h } = s.size(120, 34);
    // Pseudostates draw no label, so they keep their fixed size.
    if (!s.unlabelled) {
      expect(w).toBeGreaterThanOrEqual(120);
      expect(h).toBeGreaterThanOrEqual(Math.min(MIN_H, 34));
    }
    for (const side of sides)
      for (const t of [-1, 0, 1]) {
        const p = s.port(side, w, h, t);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(h);
      }
  });

  it('places the centre port on the matching side of the box', () => {
    for (const s of SHAPES.values()) {
      const { w, h } = s.size(60, 17);
      expect(s.port('N', w, h, 0).y).toBe(0);
      expect(s.port('W', w, h, 0).y).toBe(h / 2);
    }
  });
});
