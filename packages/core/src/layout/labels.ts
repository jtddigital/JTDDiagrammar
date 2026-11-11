import type { Box, Geometry, Point } from '../geometry.ts';
import { Grid } from './grid.ts';
import { hits, overlaps } from './metrics.ts';
import { obstacles } from './obstacles.ts';

type Content = Omit<Geometry, 'width' | 'height'>;
type Seg = [Point, Point];

const segBox = ([a, b]: Seg): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
const ALONG = [0.5, 0.3, 0.7, 0.15, 0.85];

/**
 * Edge label placement (URS-LY-008), independent of the layout engine. Each label sits on its own
 * edge (at the router's spot or along one of its segments) or, failing that, just beside it,
 * whichever collides least: nodes, headers and other labels are near-forbidden, other edges' lines
 * are discouraged, sitting beside the line and moving away from the router's spot cost a little.
 * Earlier edges choose first.
 */
export function placeLabels(g: Content): Content {
  const obs = new Grid<Box>();
  for (const o of obstacles(g)) obs.add(o, o);
  const lines = new Grid<{ edge: number; seg: Seg }>();
  g.edges.forEach((e, edge) => e.points.slice(1).forEach((p, i) => lines.add(segBox([e.points[i]!, p]), { edge, seg: [e.points[i]!, p] })));
  const placed = new Grid<Box>();

  const edges = g.edges.map((e, edge) => {
    if (!e.label) return e;
    const { w, h } = e.label;
    const origin = { x: e.label.x + w / 2, y: e.label.y + h / 2 };
    const segs = e.points
      .slice(1)
      .map((p, i): Seg => [e.points[i]!, p])
      .sort((s, t) => Math.abs(t[1].x - t[0].x) + Math.abs(t[1].y - t[0].y) - (Math.abs(s[1].x - s[0].x) + Math.abs(s[1].y - s[0].y)));
    const on = segs.flatMap(([a, b]) => ALONG.map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, beside: 0 })));
    // Beside the line, just clear of it: for parallel lines too close for two centred labels.
    const beside = segs.flatMap(([a, b]) =>
      ALONG.slice(0, 3).flatMap((t) => {
        const [x, y] = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
        return a.y === b.y ? [{ x, y: y - h / 2 - 3, beside: 1 }, { x, y: y + h / 2 + 3, beside: 1 }] : [{ x: x - w / 2 - 3, y, beside: 1 }, { x: x + w / 2 + 3, y, beside: 1 }];
      }),
    );
    const candidates = [{ ...origin, beside: 0 }, ...on, ...beside];

    let best = { score: Infinity, box: e.label as Box };
    for (const c of candidates) {
      const box = { x: c.x - w / 2, y: c.y - h / 2, w, h };
      let score = Math.hypot(c.x - origin.x, c.y - origin.y) / 50 + 3 * c.beside;
      for (const o of obs.near(box)) if (overlaps(box, o)) score += 1000;
      for (const l of placed.near(box)) if (overlaps(box, l)) score += 1000;
      const crossing = new Set([...lines.near(box)].filter((s) => s.edge !== edge && hits(s.seg, box)).map((s) => s.edge));
      score += 10 * crossing.size;
      if (score < best.score) best = { score, box };
      if (score === 0) break;
    }
    placed.add(best.box, best.box);
    return { ...e, label: { ...e.label, ...best.box } };
  });
  return { ...g, edges };
}
