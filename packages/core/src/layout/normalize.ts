import type { Box, Geometry, PlacedNode, RoutedEdge } from '../geometry.ts';

/** Translate so the content starts at (0, 0) and report its size. */
export function normalize(nodes: PlacedNode[], edges: RoutedEdge[]): Geometry {
  const boxes: Box[] = [...nodes, ...edges.flatMap((e) => [...e.points.map((p) => ({ ...p, w: 0, h: 0 })), ...(e.label ? [e.label] : [])])];
  if (!boxes.length) return { width: 0, height: 0, nodes, edges };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const shift = <T extends { x: number; y: number }>(p: T): T => ({ ...p, x: p.x - x0, y: p.y - y0 });
  return {
    width: Math.max(...boxes.map((b) => b.x + b.w)) - x0,
    height: Math.max(...boxes.map((b) => b.y + b.h)) - y0,
    nodes: nodes.map(shift),
    edges: edges.map((e) => ({ ...e, points: e.points.map(shift), ...(e.label && { label: shift(e.label) }) })),
  };
}
