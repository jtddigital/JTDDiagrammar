import type { Box, Geometry, Point, RoutedEdge } from '../geometry.ts';
import { obstacles } from './obstacles.ts';

/** Layout quality, used to hold the line on URS-LY-006..008 (lower is better). */
export interface Quality {
  /** Pairs of edge segments from different edges that cross. */
  crossings: number;
  /** Pairs of segments from different edges running on top of each other for more than a few px. */
  overlaps: number;
  /** Segments passing through a node (or header) other than the edge's own ends. */
  edgeThroughNode: number;
  /** Labels overlapping a node or header. */
  labelOnNode: number;
  /** Pairs of overlapping labels. */
  labelOnLabel: number;
  /** Segments of other edges running through a label. */
  edgeThroughLabel: number;
  bends: number;
  length: number;
}

/** Metrics the quality baseline holds the line on. */
export const GATED = ['crossings', 'overlaps', 'edgeThroughNode', 'labelOnNode', 'labelOnLabel', 'edgeThroughLabel', 'bends'] as const;

type Seg = [Point, Point];

const segs = (e: RoutedEdge): Seg[] => e.points.slice(1).map((p, i) => [e.points[i]!, p]);
const horiz = ([a, b]: Seg) => a.y === b.y;
const between = (v: number, a: number, b: number) => v > Math.min(a, b) + 0.5 && v < Math.max(a, b) - 0.5;

/** Proper crossing of a horizontal and a vertical segment (shared ends and touching don't count). */
export function cross(s: Seg, t: Seg): boolean {
  if (horiz(s) === horiz(t)) return false;
  const [h, v] = horiz(s) ? [s, t] : [t, s];
  return between(v[0].x, h[0].x, h[1].x) && between(h[0].y, v[0].y, v[1].y);
}

/** Collinear overlap longer than 4px (edges sharing a port stub are counted too). */
export function overlap(s: Seg, t: Seg): boolean {
  if (horiz(s) !== horiz(t)) return false;
  const [k, a0, a1, b0, b1] = horiz(s) ? [s[0].y === t[0].y, s[0].x, s[1].x, t[0].x, t[1].x] : [s[0].x === t[0].x, s[0].y, s[1].y, t[0].y, t[1].y];
  return k && Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)) > 4;
}

/** Does a segment enter the interior of a box (shrunk by 1px so touching borders is fine)? */
export function hits([a, b]: Seg, box: Box): boolean {
  const [x0, x1, y0, y1] = [box.x + 1, box.x + box.w - 1, box.y + 1, box.y + box.h - 1];
  if (a.y === b.y) return a.y > y0 && a.y < y1 && Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1;
  return a.x > x0 && a.x < x1 && Math.max(a.y, b.y) > y0 && Math.min(a.y, b.y) < y1;
}

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

export function quality(g: Geometry): Quality {
  const q: Quality = { crossings: 0, overlaps: 0, edgeThroughNode: 0, labelOnNode: 0, labelOnLabel: 0, edgeThroughLabel: 0, bends: 0, length: 0 };
  const all = g.edges.map(segs);
  const obs = obstacles(g);
  all.forEach((ss, i) => {
    const e = g.edges[i]!;
    q.bends += Math.max(0, ss.length - 1);
    q.length += ss.reduce((n, [a, b]) => n + Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 0);
    for (let j = i + 1; j < all.length; j++)
      for (const s of ss)
        for (const t of all[j]!) {
          if (cross(s, t)) q.crossings++;
          if (overlap(s, t)) q.overlaps++;
        }
    for (const o of obs) if (o.id !== e.from && o.id !== e.to && ss.some((s) => hits(s, o))) q.edgeThroughNode++;
  });
  const labelled = g.edges.flatMap((e) => (e.labels ?? []).map((l) => ({ e, l })));
  labelled.forEach(({ e, l }, i) => {
    q.labelOnNode += obs.filter((o) => overlaps(l, o)).length;
    q.labelOnLabel += labelled.slice(i + 1).filter((f) => overlaps(l, f.l)).length;
    q.edgeThroughLabel += g.edges.filter((f) => f !== e && segs(f).some((s) => hits(s, l))).length;
  });
  return q;
}
