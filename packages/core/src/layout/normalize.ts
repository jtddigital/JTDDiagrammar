import { min, max } from '../math.ts';
import type { Box, Geometry, Point } from '../geometry.ts';

type Content = Omit<Geometry, 'width' | 'height'>;

/** Translate so the content starts at (0, 0) and report its size. */
export function normalize(g: Content): Geometry {
  const boxes: Box[] = [
    ...g.bands,
    ...(g.corner ? [g.corner] : []),
    ...(g.fillers ?? []),
    ...g.containers,
    ...g.nodes,
    ...g.nodes.flatMap((n) => (n.callout ? [n.callout] : [])),
    ...g.edges.flatMap((e) => [...e.points.map((p) => ({ ...p, w: 0, h: 0 })), ...(e.label ? [e.label] : [])]),
  ];
  if (!boxes.length) return { width: 0, height: 0, ...g };
  const x0 = min(boxes.map((b) => b.x));
  const y0 = min(boxes.map((b) => b.y));
  const shift = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x - x0, y: p.y - y0 });
  return {
    width: max(boxes.map((b) => b.x + b.w)) - x0,
    height: max(boxes.map((b) => b.y + b.h)) - y0,
    bands: g.bands.map((b) => ({ ...shift(b), header: shift(b.header) })),
    ...(g.corner && { corner: shift(g.corner) }),
    ...(g.fillers && { fillers: g.fillers.map(shift) }),
    containers: g.containers.map(shift),
    nodes: g.nodes.map((n) => ({ ...shift(n), ...(n.callout && { callout: { ...shift(n.callout), leader: [shift(n.callout.leader[0]), shift(n.callout.leader[1])] as [Point, Point] } }) })),
    edges: g.edges.map((e) => ({ ...e, points: e.points.map(shift), ...(e.label && { label: shift(e.label) }) })),
  };
}
