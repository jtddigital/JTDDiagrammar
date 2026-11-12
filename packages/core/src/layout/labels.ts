import type { Box, Callout, Geometry, PlacedNode, Point } from '../geometry.ts';
import type { Side } from '../ir/types.ts';
import { shape } from '../shapes/library.ts';
import { CALLOUT_GAP } from '../style.ts';
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
  const nodes = g.nodes.map((n) => (n.callout ? placeCallout(n, n.callout, g, obs, lines, placed) : n));

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
  return { ...g, nodes, edges };
}

const inside = (outer: Box, b: Box) => b.x >= outer.x - 0.5 && b.y >= outer.y - 0.5 && b.x + b.w <= outer.x + outer.w + 0.5 && b.y + b.h <= outer.y + outer.h + 0.5;

/**
 * A callout beside its node (URS-DM-017): right, below, above or left, then the corners, then the
 * same further out. It must avoid nodes, headers and other labels, stay in the node's lane, phase
 * and container, and keep off edges where it can.
 */
function placeCallout(n: PlacedNode, c: Callout, g: Content, obs: Grid<Box>, lines: Grid<{ edge: number; seg: Seg }>, placed: Grid<Box>): PlacedNode {
  const { w, h } = c;
  const [cx, cy] = [n.x + n.w / 2, n.y + n.h / 2];
  const ring = (d: number) => [
    { x: n.x + n.w + d, y: cy - h / 2 },
    { x: cx - w / 2, y: n.y + n.h + d },
    { x: cx - w / 2, y: n.y - d - h },
    { x: n.x - d - w, y: cy - h / 2 },
    { x: n.x + n.w + d / 2, y: n.y - d / 2 - h },
    { x: n.x + n.w + d / 2, y: n.y + n.h + d / 2 },
    { x: n.x - d / 2 - w, y: n.y - d / 2 - h },
    { x: n.x - d / 2 - w, y: n.y + n.h + d / 2 },
  ];
  // The engine's reserved spot first, then around the node.
  const candidates = [{ x: c.x, y: c.y }, ...ring(CALLOUT_GAP), ...ring(CALLOUT_GAP * 3)];
  const regions = [...g.bands, ...g.containers];
  let best = { score: Infinity, box: { ...candidates[0]!, w, h } };
  candidates.forEach((p, rank) => {
    const box = { ...p, w, h };
    let score = rank * 0.5;
    for (const o of obs.near(box)) if (overlaps(box, o)) score += 1000;
    for (const l of placed.near(box)) if (overlaps(box, l)) score += 1000;
    for (const r of regions) {
      if (inside(r, n) && !inside(r, box)) score += 300;
      else if (!inside(r, n) && 'depth' in r && overlaps(box, r)) score += 300;
    }
    score += 10 * new Set([...lines.near(box)].filter((s) => hits(s.seg, box)).map((s) => s.edge)).size;
    if (score < best.score) best = { score, box };
  });
  placed.add(best.box, best.box);
  return { ...n, callout: { ...c, ...best.box, leader: leader(n, best.box) } };
}

/** From the shape's outline on the side facing the callout to the nearest point of the callout. */
function leader(n: PlacedNode, b: Box): [Point, Point] {
  const side: Side = b.x >= n.x + n.w ? 'E' : b.x + b.w <= n.x ? 'W' : b.y >= n.y + n.h ? 'S' : 'N';
  const local = shape(n.shape).port(side, n.w, n.h, 0);
  const from = { x: n.x + local.x, y: n.y + local.y };
  return [from, { x: Math.min(Math.max(from.x, b.x), b.x + b.w), y: Math.min(Math.max(from.y, b.y), b.y + b.h) }];
}
