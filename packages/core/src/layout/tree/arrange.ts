import type { Point } from '../../geometry.ts';
import { max } from '../../math.ts';
import { corners, move, type Block, type Frame } from './block.ts';

/** Spacing, in top-to-bottom terms: between siblings, between levels, indent and gap in a stack. */
export const GAP = { sibling: 24, level: 40, indent: 20, stacked: 14 };
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
function sequence(ls: Laid[], mode: Mode, x0: number, y0: number) {
  let [x, y] = [x0, y0];
  const placed = ls.map((l) => {
    const p = at(l, mode, x, y);
    if (mode === 'row') x += l.w + GAP.sibling;
    else y += l.h + GAP.stacked;
    return p;
  });
  const w = mode === 'row' ? x - GAP.sibling - x0 : max(ls.map((l) => l.w));
  const h = mode === 'row' ? max(ls.map((l) => l.h)) : y - GAP.stacked - y0;
  return { placed, w, h };
}

/** Lay out a unit; a container's members inside its box, the line to them going round its label strip. */
export function lay(u: Unit, mode: Mode, frame: (c: string) => Frame): Laid {
  if ('kid' in u) return kidLaid(u.kid, mode);
  const f = frame(u.container);
  const inner = u.units.map((v) => lay(v, mode, frame));
  const top = f.strip === 'top';
  // Rows: with the strip on top, a line comes in from the side below it and runs along INNER.
  // Stacks: with the strip on the left, a line comes in from above and runs down a trunk inside.
  const [x0, y0] = mode === 'row' ? [f.left, f.top + (top ? INNER : 0)] : [f.left + (top ? 0 : GAP.indent), f.top];
  const { placed, w: cw, h: ch } = sequence(inner, mode, x0, y0);
  const w = Math.max(x0 + cw + f.right, f.minW);
  const h = Math.max(y0 + ch + f.bottom, f.minH);
  const ends = placed.flatMap((p) => p.ends);
  const bus = f.top + INNER / 2;
  const trunk = f.left + GAP.indent / 2;
  // One person to reach, strip on top: drop beside the box and come straight in from the side, below the strip.
  const single = ends.length === 1 && ends[0]!.side;
  const enter = (e: End): End => {
    if (mode === 'row' && top && single) return { ...e, path: (y: number) => [{ x: -GUTTER, y }, { x: -GUTTER, y: single.y }, single] };
    const { side: _, ...rest } = e;
    if (mode === 'row') return top ? { ...rest, path: (y: number) => [{ x: -GUTTER, y }, { x: -GUTTER, y: bus }, ...e.path(bus)] } : rest;
    return top ? e : { ...rest, path: (x: number) => [{ x, y: -GAP.stacked / 2 }, { x: trunk, y: -GAP.stacked / 2 }, ...e.path(trunk)] };
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
function row(id: string, n: Node, ls: Laid[]): Block {
  const [y, bus] = [n.h + GAP.level, n.h + GAP.level / 2];
  let x = 0;
  const items = ls.map((l) => {
    const item = { l, x, y, p: at(l, 'row', x, y) };
    x += l.w + GAP.sibling;
    return item;
  });
  const ends = items.flatMap((i) => i.p.ends);
  const firsts = ends.map((e) => e.path(bus)[0]!.x);
  const cx = (firsts[0]! + firsts.at(-1)!) / 2;
  return close(id, n, cx - n.w / 2, items, ends.map((e) => ({ edge: e.edge, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, ...e.path(bus)] })));
}

/** Children in `columns` stacks under the node, each hanging off a trunk line on its left (URS-LY-014). */
function stacked(id: string, n: Node, ls: Laid[], columns: number): Block {
  const per = Math.ceil(ls.length / Math.min(columns, ls.length));
  const cols: Laid[][] = [];
  for (let i = 0; i < ls.length; i += per) cols.push(ls.slice(i, i + per));
  const top = n.h + GAP.level;
  const bus = n.h + GAP.level / 2;
  let x = 0;
  const trunks = cols.map((c) => {
    const t = x;
    x += GAP.indent + max(c.map((l) => l.w)) + GAP.sibling;
    return t;
  });
  const cx = (trunks[0]! + trunks.at(-1)!) / 2;
  const items = cols.flatMap((c, ci) => {
    let y = top;
    return c.map((l) => {
      const item = { l, x: trunks[ci]! + GAP.indent, y, p: at(l, 'stack', trunks[ci]! + GAP.indent, y), t: trunks[ci]! };
      y += l.h + GAP.stacked;
      return item;
    });
  });
  const lines = items.flatMap((i) => i.p.ends.map((e) => ({ edge: e.edge, points: [{ x: cx, y: n.h }, { x: cx, y: bus }, { x: i.t, y: bus }, ...e.path(i.t)] })));
  return close(id, n, cx - n.w / 2, items, lines);
}

/** Lay out one node and its subtree: children (already laid out as `kids`) in a row, or in `stack` stacks. */
export function arrange(id: string, n: Node, kids: Kid[], stack: number | undefined, frame: (c: string) => Frame): Block {
  if (!kids.length) return leafOf(id, n);
  const mode: Mode = stack ? 'stack' : 'row';
  const ls = unitsOf(kids).map((u) => lay(u, mode, frame));
  return stack ? stacked(id, n, ls, stack) : row(id, n, ls);
}
