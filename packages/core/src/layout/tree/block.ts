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
  /** The side of a box framing the root that carries the label strip, if a box does; lines go round it (URS-TYP-012). */
  strip?: 'top' | 'left';
  nodes: { id: string; x: number; y: number }[];
  paths: { edge: number; points: Point[] }[];
  /** Container boxes drawn around parts of the subtree (URS-TYP-012). */
  boxes: { container: string; box: Box }[];
}

export const move = (b: Block, dx: number, dy: number) => ({
  nodes: b.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })),
  paths: b.paths.map((p) => ({ ...p, points: p.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) })),
  boxes: b.boxes.map((c) => ({ ...c, box: { ...c.box, x: c.box.x + dx, y: c.box.y + dy } })),
});

/** Room around a block for a container: padding on each side and the box's own minimum size. */
export interface Frame {
  container: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  minW: number;
  minH: number;
  /** Which side the label strip is on, in these top-to-bottom coordinates. */
  strip: 'top' | 'left';
}

/** The block inside a container box: its contents shifted in, the box recorded around them. */
export function wrap(b: Block, f: Frame): Block {
  const [left, w] = [f.left, Math.max(b.w + f.left + f.right, f.minW)];
  const h = Math.max(b.h + f.top + f.bottom, f.minH);
  const m = move(b, left, f.top);
  return { ...b, ...m, w, h, anchor: b.anchor + left, left: b.left + left, top: b.top + f.top, strip: f.strip, boxes: [...m.boxes, { container: f.container, box: { x: 0, y: 0, w, h } }] };
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
