import { max } from '../../math.ts';
import { corners, move, type Block } from './block.ts';

/** Spacing, in top-to-bottom terms: between siblings, between levels, indent and gap in a stack. */
export const GAP = { sibling: 24, level: 40, indent: 20, stacked: 14 };
/** How far outside a box a line runs to go round its label strip. */
const GUTTER = 8;

interface Node {
  w: number;
  h: number;
}
interface Kid {
  block: Block;
  edge: number;
}

const leafOf = (id: string, n: Node): Block => ({ w: n.w, h: n.h, anchor: n.w / 2, left: 0, top: 0, nodeH: n.h, nodes: [{ id, x: 0, y: 0 }], paths: [], boxes: [] });

/** Shift a block's contents so nothing sits left of 0, and measure it. */
function close(id: string, n: Node, nodeX: number, kids: { block: Block; x: number; y: number; edge: number; points: { x: number; y: number }[] }[]): Block {
  // Lines count too: a trunk or a gutter can run left of every box.
  const minX = Math.min(nodeX, ...kids.map((k) => k.x), ...kids.flatMap((k) => k.points.map((p) => p.x)));
  const dx = -minX;
  const nodes = [{ id, x: nodeX + dx, y: 0 }, ...kids.flatMap((k) => move(k.block, k.x + dx, k.y).nodes)];
  const moved = kids.map((k) => move(k.block, k.x + dx, k.y));
  const paths = [...kids.map((k) => ({ edge: k.edge, points: corners(k.points).map((p) => ({ x: p.x + dx, y: p.y })) })), ...moved.flatMap((m) => m.paths)];
  const right = Math.max(nodeX + n.w, ...kids.map((k) => k.x + k.block.w), ...kids.flatMap((k) => k.points.map((p) => p.x)));
  return {
    w: right - minX,
    h: max(kids.map((k) => k.y + k.block.h)),
    anchor: nodeX + n.w / 2 + dx,
    left: nodeX + dx,
    top: 0,
    nodeH: n.h,
    nodes,
    paths,
    boxes: moved.flatMap((m) => m.boxes),
  };
}

/** Children side by side under the node, joined by a bus line. */
function row(id: string, n: Node, kids: Kid[]): Block {
  let x = 0;
  const at = kids.map((k) => ((x += k.block.w + GAP.sibling), x - k.block.w - GAP.sibling));
  const anchors = kids.map((k, i) => at[i]! + k.block.anchor);
  const cx = (anchors[0]! + anchors.at(-1)!) / 2;
  const [y, bus] = [n.h + GAP.level, n.h + GAP.level / 2];
  return close(
    id,
    n,
    cx - n.w / 2,
    kids.map((k, i) => {
      const b = k.block;
      // A box with its label on top: drop beside it and come in from the side, below the strip.
      const mid = y + b.top + b.nodeH / 2;
      const end =
        b.strip === 'top'
          ? [{ x: at[i]! - GUTTER, y: bus }, { x: at[i]! - GUTTER, y: mid }, { x: at[i]! + b.left, y: mid }]
          : [{ x: anchors[i]!, y: bus }, { x: anchors[i]!, y: y + b.top }];
      return { ...k, x: at[i]!, y, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, ...end] };
    }),
  );
}

/** Children in `columns` stacks under the node, each hanging off a trunk line on its left (URS-LY-014). */
function stacked(id: string, n: Node, kids: Kid[], columns: number): Block {
  const per = Math.ceil(kids.length / Math.min(columns, kids.length));
  const cols: Kid[][] = [];
  for (let i = 0; i < kids.length; i += per) cols.push(kids.slice(i, i + per));
  const top = n.h + GAP.level;
  let x = 0;
  const trunks = cols.map((c) => ((x += GAP.indent + max(c.map((k) => k.block.w)) + GAP.sibling), x - GAP.indent - max(c.map((k) => k.block.w)) - GAP.sibling));
  const cx = (trunks[0]! + trunks.at(-1)!) / 2;
  const bus = n.h + GAP.level / 2;
  const placed = cols.flatMap((c, ci) => {
    let y = top;
    return c.map((k) => {
      const at = { x: trunks[ci]! + GAP.indent, y };
      y += k.block.h + GAP.stacked;
      const b = k.block;
      const mid = at.y + b.top + b.nodeH / 2;
      const t = trunks[ci]!;
      // A box with its label on the left side: go above it and come in from the top instead.
      const end =
        b.strip === 'left'
          ? [{ x: t, y: at.y - GAP.stacked / 2 }, { x: at.x + b.anchor, y: at.y - GAP.stacked / 2 }, { x: at.x + b.anchor, y: at.y + b.top }]
          : [{ x: t, y: mid }, { x: at.x + b.left, y: mid }];
      return { ...k, ...at, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, { x: t, y: bus }, ...end] };
    });
  });
  return close(id, n, cx - n.w / 2, placed);
}

/** Lay out one node and its subtree (already laid out as `kids`): a row, or `stack` stacks. */
export function arrange(id: string, n: Node, kids: Kid[], stack: number | undefined): Block {
  if (!kids.length) return leafOf(id, n);
  return stack ? stacked(id, n, kids, stack) : row(id, n, kids);
}
