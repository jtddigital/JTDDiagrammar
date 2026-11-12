import { describe, expect, it } from 'vitest';
import type { Geometry } from '../src/index.ts';
import { createRegistry, parseXml, render, toXml } from '../src/index.ts';
import { along } from '../src/layout/labels.ts';
import { lineHeight } from '../src/measure/text.ts';
import { LABEL_BOX, LABEL_FONT } from '../src/style.ts';

const reg = createRegistry();
const geo = (d: unknown): Geometry => {
  const r = render(d, reg);
  expect(r.diagnostics).toEqual([]);
  return r.geometry!;
};
const centre = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

const doc = {
  version: '1',
  type: 'flowchart',
  nodes: [
    { id: 'a', to: [{ node: 'b', label: 'auto', labels: [{ text: 'start', at: 10 }, { text: 'mid', at: 50 }, { text: 'other' }] }] },
    { id: 'b', to: [{ node: 'c', label: 'Yes' }] },
    { id: 'c' },
  ],
};

describe('edge labels (URS-DM-024)', () => {
  it('finds the point a percentage of the way along a polyline', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(along(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(along(pts, 25)).toEqual({ x: 50, y: 0 });
    expect(along(pts, 75)).toEqual({ x: 100, y: 50 });
    expect(along(pts, 100)).toEqual({ x: 100, y: 100 });
  });

  it('keeps label order, pins `at` labels on the edge at that percentage, and keeps all labels apart', () => {
    const e = geo(doc).edges[0]!;
    const ls = e.labels!;
    expect(ls.map((l) => l.lines[0])).toEqual(['auto', 'start', 'mid', 'other']);
    expect(centre(ls[1]!)).toEqual(along(e.points, 10));
    expect(centre(ls[2]!)).toEqual(along(e.points, 50));
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) {
        const [p, q] = [ls[i]!, ls[j]!];
        if (p.at === undefined || q.at === undefined) expect(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h, `${p.lines} / ${q.lines}`).toBe(false);
      }
  });

  it('draws a tight box: the text plus a thin margin', () => {
    const l = geo(doc).edges[1]!.labels![0]!;
    expect(l.h).toBeCloseTo(lineHeight(LABEL_FONT) + 2 * LABEL_BOX.y);
    expect(render(doc, reg).svg).toContain(`height="${l.h}" rx="2"`);
  });

  it('round-trips labels through XML', () => {
    expect(parseXml(toXml(doc), reg)).toEqual({ value: doc, diagnostics: [] });
  });

  it('rejects positions outside 0–100', () => {
    const bad = { ...doc, nodes: [{ id: 'a', to: [{ node: 'b', labels: [{ text: 'x', at: 120 }] }] }, { id: 'b' }] };
    expect(render(bad, reg).diagnostics.map((d) => [d.code, d.path])).toEqual([['schema.maximum', '/nodes/0/to/0/labels/0/at']]);
  });
});
