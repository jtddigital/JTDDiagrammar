import type { Box, Point } from '../../geometry.ts';

/**
 * A laid-out subtree, in top-to-bottom coordinates relative to its own top-left corner. Its root node
 * sits at the top; `anchor` is the root's centre, where the parent's line arrives.
 */
export interface Block {
  w: number;
  h: number;
  anchor: number;
  /** The root node's left edge, top and height. */
  left: number;
  top: number;
  nodeH: number;
  nodes: { id: string; x: number; y: number }[];
  paths: { edge: number; points: Point[] }[];
  /** Container boxes drawn around parts of the subtree (URS-TYP-012). */
  boxes: { container: string; box: Box }[];
}

type Drawn = Pick<Block, 'nodes' | 'paths' | 'boxes'>;

export const move = (b: Drawn, dx: number, dy: number): Drawn => ({
  nodes: b.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
  paths: b.paths.map((p) => ({ ...p, points: p.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) })),
  boxes: b.boxes.map((c) => ({ ...c, box: { ...c.box, x: c.box.x + dx, y: c.box.y + dy } })),
});

/** Room around a container's contents: padding on each side, its minimum size, and the side its label strip is on. */
export interface Frame {
  container: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  minW: number;
  minH: number;
  strip: 'top' | 'left';
}

/** Drop repeated and collinear points, so each line is its corners only. */
export function corners(ps: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of ps) {
    if (out.length && out.at(-1)!.x === p.x && out.at(-1)!.y === p.y) continue;
    const [a, b] = [out.at(-2), out.at(-1)];
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) out.pop();
    out.push(p);
  }
  return out;
}
