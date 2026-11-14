import type { Point } from '../../geometry.ts';
import { max } from '../../math.ts';
import { corners, move, type Block, type Frame } from './block.ts';

/** Spacing, in top-to-bottom terms: between siblings, between levels, indent and gap in a stack. */
export const GAP = { sibling: 24, level: 40, indent: 20, stacked: 14 };
export type Gaps = typeof GAP;
/** The spacing on an axis where the diagram asks to save space (`compact`). */
export const TIGHT: Gaps = { sibling: 10, level: 24, indent: 12, stacked: 6 };

/** What a layout needs besides the subtrees: each container's frame, the spacing, and how to score a fit. */
export interface Ctx {
  frame(c: string): Frame;
  gap: Gaps;
  /** When saving space: a block's cost (lower fits better) beside the one-row arrangement, to choose how a node's children are arranged. */
  fit?(b: Block, row: Block): number;
}
/** How far outside a box a line runs to go round its label strip. */
const GUTTER = 8;
/** Room in a box between its label strip and its people, where the line to them runs. */
const INNER = 20;

interface Node {
  w: number;
  h: number;
}

/** A child subtree, and the containers it enters below its parent's, innermost first. */
export interface Kid {
  block: Block;
  edge: number;
  chain: string[];
}

/** A child subtree, or a box of units: siblings in one container are drawn together, whether or not one of them heads it (URS-TYP-012). */
type Unit = { kid: Kid } | { container: string; units: Unit[] };

/** Group siblings by the outermost container they enter, keeping first-appearance order. */
export function unitsOf(kids: readonly Kid[]): Unit[] {
  const groups = new Map<string, Kid[]>();
  const order: (Kid | string)[] = [];
  for (const k of kids) {
    const c = k.chain.at(-1);
    if (c === undefined) order.push(k);
    else {
      if (!groups.has(c)) {
        groups.set(c, []);
        order.push(c);
      }
      groups.get(c)!.push({ ...k, chain: k.chain.slice(0, -1) });
    }
  }
  return order.map((o) => (typeof o === 'string' ? { container: o, units: unitsOf(groups.get(o)!) } : { kid: o }));
}

type Mode = 'row' | 'stack';

/** A laid-out unit, relative to its own top-left. */
export interface Laid {
  w: number;
  h: number;
  drawn: Pick<Block, 'nodes' | 'paths' | 'boxes'>;
  /** The line to each child inside, from the parent's bus at y (row) or trunk at x (stack). */
  ends: End[];
}

interface End {
  edge: number;
  path(from: number): Point[];
  /** Where a line from the left meets the person, when it can come straight in from that side. */
  side?: Point;
}

const shift = (ps: Point[], dx: number, dy: number) => ps.map((p) => ({ x: p.x + dx, y: p.y + dy }));
/** The unit placed at (dx, dy) in its parent's coordinates. */
function at(l: Laid, mode: Mode, dx: number, dy: number): Laid {
  return {
    ...l,
    drawn: move(l.drawn, dx, dy),
    ends: l.ends.map((e) => ({
      edge: e.edge,
      path: (from: number) => shift(e.path(mode === 'row' ? from - dy : from - dx), dx, dy),
      ...(e.side && { side: { x: e.side.x + dx, y: e.side.y + dy } }),
    })),
  };
}

function kidLaid(k: Kid, mode: Mode): Laid {
  const b = k.block;
  const mid = b.top + b.nodeH / 2;
  const path =
    mode === 'row'
      ? (y: number) => [
          { x: b.anchor, y },
          { x: b.anchor, y: b.top },
        ]
      : (x: number) => [
          { x, y: mid },
          { x: b.left, y: mid },
        ];
  return { w: b.w, h: b.h, drawn: b, ends: [{ edge: k.edge, path, side: { x: b.left, y: mid } }] };
}

/** Units side by side (row) or one under another (stack), from (x0, y0). */
function sequence(ls: Laid[], mode: Mode, x0: number, y0: number, g: Gaps) {
  let [x, y] = [x0, y0];
  const placed = ls.map((l) => {
    const p = at(l, mode, x, y);
    if (mode === 'row') x += l.w + g.sibling;
    else y += l.h + g.stacked;
    return p;
  });
  const w = mode === 'row' ? x - g.sibling - x0 : max(ls.map((l) => l.w));
  const h = mode === 'row' ? max(ls.map((l) => l.h)) : y - g.stacked - y0;
  return { placed, w, h };
}

/** Lay out a unit; a container's members inside its box, the line to them going round its label strip. */
export function lay(u: Unit, mode: Mode, ctx: Ctx): Laid {
  if ('kid' in u) return kidLaid(u.kid, mode);
  const { gap: g } = ctx;
  const f = ctx.frame(u.container);
  const inner = u.units.map((v) => lay(v, mode, ctx));
  const top = f.strip === 'top';
  // Rows: with the strip on top, a line comes in from the side below it and runs along INNER.
  // Stacks: with the strip on the left, a line comes in from above and runs down a trunk inside.
  const [x0, y0] = mode === 'row' ? [f.left, f.top + (top ? INNER : 0)] : [f.left + (top ? 0 : g.indent), f.top];
  const { placed, w: cw, h: ch } = sequence(inner, mode, x0, y0, g);
  const w = Math.max(x0 + cw + f.right, f.minW);
  const h = Math.max(y0 + ch + f.bottom, f.minH);
  const ends = placed.flatMap((p) => p.ends);
  const bus = f.top + INNER / 2;
  const trunk = f.left + g.indent / 2;
  // One person to reach, strip on top: drop beside the box and come straight in from the side, below the strip.
  const single = ends.length === 1 && ends[0]!.side;
  const enter = (e: End): End => {
    if (mode === 'row' && top && single) return { ...e, path: (y: number) => [{ x: -GUTTER, y }, { x: -GUTTER, y: single.y }, single] };
    const { side: _, ...rest } = e;
    if (mode === 'row') return top ? { ...rest, path: (y: number) => [{ x: -GUTTER, y }, { x: -GUTTER, y: bus }, ...e.path(bus)] } : rest;
    return top ? e : { ...rest, path: (x: number) => [{ x, y: -g.stacked / 2 }, { x: trunk, y: -g.stacked / 2 }, ...e.path(trunk)] };
  };
  const drawn = placed.map((p) => p.drawn);
  return {
    w,
    h,
    drawn: { nodes: drawn.flatMap((d) => d.nodes), paths: drawn.flatMap((d) => d.paths), boxes: [...drawn.flatMap((d) => d.boxes), { container: u.container, box: { x: 0, y: 0, w, h } }] },
    ends: ends.map(enter),
  };
}

const leafOf = (id: string, n: Node): Block => ({ w: n.w, h: n.h, anchor: n.w / 2, left: 0, top: 0, nodeH: n.h, nodes: [{ id, x: 0, y: 0 }], paths: [], boxes: [] });

/** The node over its laid-out children, joined by `lines`; shifted so nothing (lines included) sits left of 0. */
function close(id: string, n: Node, nodeX: number, items: { l: Laid; x: number; y: number; p: Laid }[], lines: { edge: number; points: Point[] }[]): Block {
  const xs = lines.flatMap((c) => c.points.map((p) => p.x));
  const minX = Math.min(nodeX, ...items.map((i) => i.x), ...xs);
  const right = Math.max(nodeX + n.w, ...items.map((i) => i.x + i.l.w), ...xs);
  const dx = -minX;
  const drawn = items.map((i) => move(i.p.drawn, dx, 0));
  return {
    w: right - minX,
    h: max(items.map((i) => i.y + i.l.h)),
    anchor: nodeX + n.w / 2 + dx,
    left: nodeX + dx,
    top: 0,
    nodeH: n.h,
    nodes: [{ id, x: nodeX + dx, y: 0 }, ...drawn.flatMap((d) => d.nodes)],
    paths: [...lines.map((c) => ({ edge: c.edge, points: corners(c.points).map((p) => ({ x: p.x + dx, y: p.y })) })), ...drawn.flatMap((d) => d.paths)],
    boxes: drawn.flatMap((d) => d.boxes),
  };
}

/** Children side by side under the node, joined by a bus line. */
function row(id: string, n: Node, ls: Laid[], g: Gaps): Block {
  const [y, bus] = [n.h + g.level, n.h + g.level / 2];
  let x = 0;
  const items = ls.map((l) => {
    const item = { l, x, y, p: at(l, 'row', x, y) };
    x += l.w + g.sibling;
    return item;
  });
  const ends = items.flatMap((i) => i.p.ends);
  const firsts = ends.map((e) => e.path(bus)[0]!.x);
  const cx = (firsts[0]! + firsts.at(-1)!) / 2;
  return close(id, n, cx - n.w / 2, items, ends.map((e) => ({ edge: e.edge, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, ...e.path(bus)] })));
}

/** `ls` in order, cut into at most `k` runs whose heights (with gaps) are as even as possible. */
export function balance<T extends { h: number }>(ls: T[], k: number, gap: number): T[][] {
  const n = ls.length;
  k = Math.min(k, n);
  const pre = [0];
  for (const l of ls) pre.push(pre.at(-1)! + l.h + gap);
  const run = (i: number, j: number) => pre[j]! - pre[i]! - gap;
  // best[c][j]: the tallest run when the first j go into c runs; cut[c][j]: where the last run starts.
  const best = [Array.from({ length: n + 1 }, (_, j) => (j ? Infinity : 0))];
  const cut: number[][] = [[]];
  for (let c = 1; c <= k; c++) {
    best.push(Array<number>(n + 1).fill(Infinity));
    cut.push(Array<number>(n + 1).fill(0));
    for (let j = 1; j <= n; j++)
      for (let i = c - 1; i < j; i++) {
        const v = Math.max(best[c - 1]![i]!, run(i, j));
        // On a tie the later cut wins, so earlier runs are the fuller ones.
        if (v <= best[c]![j]!) [best[c]![j], cut[c]![j]] = [v, i];
      }
  }
  const out: T[][] = [];
  for (let c = k, j = n; c > 0 && j > 0; c--) {
    const i = cut[c]![j]!;
    out.unshift(ls.slice(i, j));
    j = i;
  }
  return out;
}

/** Children in `columns` stacks under the node, each hanging off a trunk line on its left, columns as even in height as order allows (URS-LY-014). */
function stacked(id: string, n: Node, ls: Laid[], columns: number, g: Gaps): Block {
  const cols = balance(ls, columns, g.stacked);
  const top = n.h + g.level;
  const bus = n.h + g.level / 2;
  let x = 0;
  const trunks = cols.map((c) => {
    const t = x;
    x += g.indent + max(c.map((l) => l.w)) + g.sibling;
    return t;
  });
  const cx = (trunks[0]! + trunks.at(-1)!) / 2;
  const items = cols.flatMap((c, ci) => {
    let y = top;
    return c.map((l) => {
      const item = { l, x: trunks[ci]! + g.indent, y, p: at(l, 'stack', trunks[ci]! + g.indent, y), t: trunks[ci]! };
      y += l.h + g.stacked;
      return item;
    });
  });
  const lines = items.flatMap((i) => i.p.ends.map((e) => ({ edge: e.edge, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, { x: i.t, y: bus }, ...e.path(i.t)] })));
  return close(id, n, cx - n.w / 2, items, lines);
}

/** Lay out one node and its subtree: children (already laid out as `kids`) in a row, or in `stack` stacks. */
export function arrange(id: string, n: Node, kids: Kid[], stack: number | undefined, ctx: Ctx): Block {
  if (!kids.length) return leafOf(id, n);
  const units = unitsOf(kids);
  const build = (s: number) => (s ? stacked(id, n, units.map((u) => lay(u, 'stack', ctx)), s, ctx.gap) : row(id, n, units.map((u) => lay(u, 'row', ctx)), ctx.gap));
  if (stack !== undefined || !ctx.fit) return build(stack ?? 0);
  // Saving space: try one row, then 1, 2, 3… columns, and keep the best fit; a row unless clearly beaten.
  const one = build(0);
  let [best, score] = [one, ctx.fit(one, one) * FIT_MARGIN];
  for (let k = 1; k <= Math.min(units.length, MAX_COLUMNS); k++) {
    const b = build(k);
    const s = ctx.fit(b, one);
    if (s < score) [best, score] = [b, s];
  }
  return best;
}

/** How much better another arrangement must fit before it replaces a row, and the most columns tried. */
const FIT_MARGIN = 0.97;
const MAX_COLUMNS = 8;
