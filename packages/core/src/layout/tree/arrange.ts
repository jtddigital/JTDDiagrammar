import { max } from '../../math.ts';
import { corners, move, type Block } from './block.ts';

/** Spacing, in top-to-bottom terms: between siblings, between levels, indent and gap in a stack. */
export const GAP = { sibling: 24, level: 40, indent: 20, stacked: 14 };

interface Node {
  w: number;
  h: number;
}
interface Kid {
  block: Block;
  edge: number;
}

const leafOf = (id: string, n: Node): Block => ({ w: n.w, h: n.h, anchor: n.w / 2, left: 0, nodeH: n.h, nodes: [{ id, x: 0, y: 0 }], paths: [] });

/** Shift a block's contents so nothing sits left of 0, and measure it. */
function close(id: string, n: Node, nodeX: number, kids: { block: Block; x: number; y: number; edge: number; points: { x: number; y: number }[] }[]): Block {
  const minX = Math.min(nodeX, ...kids.map((k) => k.x));
  const dx = -minX;
  const nodes = [{ id, x: nodeX + dx, y: 0 }, ...kids.flatMap((k) => move(k.block, k.x + dx, k.y).nodes)];
  const paths = [
    ...kids.map((k) => ({ edge: k.edge, points: corners(k.points).map((p) => ({ x: p.x + dx, y: p.y })) })),
    ...kids.flatMap((k) => move(k.block, k.x + dx, k.y).paths),
  ];
  const right = Math.max(nodeX + n.w, ...kids.map((k) => k.x + k.block.w));
  return {
    w: right - minX,
    h: max(kids.map((k) => k.y + k.block.h)),
    anchor: nodeX + n.w / 2 + dx,
    left: nodeX + dx,
    nodeH: n.h,
    nodes,
    paths,
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
    kids.map((k, i) => ({ ...k, x: at[i]!, y, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, { x: anchors[i]!, y: bus }, { x: anchors[i]!, y }] })),
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
      const mid = at.y + k.block.nodeH / 2;
      const t = trunks[ci]!;
      return { ...k, ...at, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, { x: t, y: bus }, { x: t, y: mid }, { x: at.x + k.block.left, y: mid }] };
    });
  });
  return close(id, n, cx - n.w / 2, placed);
}

/** Lay out one node and its subtree (already laid out as `kids`): a row, or `stack` stacks. */
export function arrange(id: string, n: Node, kids: Kid[], stack: number | undefined): Block {
  if (!kids.length) return leafOf(id, n);
  return stack ? stacked(id, n, kids, stack) : row(id, n, kids);
}
