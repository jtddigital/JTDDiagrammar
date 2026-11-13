import type { Box, PlacedContainer, PlacedNode, Point, RoutedEdge } from '../../geometry.ts';
import type { GraphIR } from '../../ir/types.ts';
import type { LayoutEngine } from '../../registry/layout-engine.ts';
import { CALLOUT_GAP, CONTAINER_FONT, CONTAINER_HEAD_PAD, CONTAINER_TEXT_MAX, fontOf } from '../../style.ts';
import { textBlock } from '../../measure/text.ts';
import { placeLabels } from '../labels.ts';
import { sized } from '../layered/build.ts';
import { labelsOf } from '../layered/route.ts';
import { normalize } from '../normalize.ts';
import { arrange, GAP, lay, TIGHT, unitsOf, type Ctx, type Kid } from './arrange.ts';
import type { Frame } from './block.ts';

/** Container padding on the sides without the label. */
const PAD = 14;

/**
 * Tree engine (URS-LY-014): each node's first incoming edge makes it a child; children sit in a row
 * under their parent, or in `stack` stacks when the node asks for that. Other edges (extra parents,
 * cycles) are drawn straight. Left-to-right is laid out top-to-bottom and turned.
 */
export const tree: LayoutEngine = {
  id: 'tree',
  layout(ir: GraphIR) {
    const lr = ir.direction === 'LR';
    const sizes = new Map(ir.nodes.map((n) => [n.id, sized(n)]));
    const dims = (id: string) => {
      const s = sizes.get(id)!;
      return lr ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
    };
    const parent = new Map<string, number>();
    ir.edges.forEach((e, i) => {
      if (e.from !== e.to && sizes.has(e.from) && sizes.has(e.to) && !parent.has(e.to)) parent.set(e.to, i);
    });
    const children = new Map<string, string[]>();
    for (const n of ir.nodes) {
      const p = parent.get(n.id);
      if (p !== undefined) children.set(ir.edges[p]!.from, [...(children.get(ir.edges[p]!.from) ?? []), n.id]);
    }
    const stack = new Map(ir.nodes.map((n) => [n.id, n.stack]));

    // Containers (URS-TYP-012): a subtree entering one is framed with padding and the label strip.
    const containers = new Map(ir.containers.map((c) => [c.id, c]));
    const chain = (c: string | undefined): string[] => {
      const out: string[] = [];
      for (let x = c; x !== undefined && containers.has(x) && !out.includes(x); x = containers.get(x)!.parent) out.push(x);
      return out;
    };
    const labels = new Map(ir.containers.map((c) => [c.id, textBlock(c.label ?? '', CONTAINER_TEXT_MAX, fontOf(CONTAINER_FONT, c.style))]));
    const head = (c: string) => labels.get(c)!.height + 2 * CONTAINER_HEAD_PAD;
    // Left to right is laid out turned, so the label strip, on top when drawn, is on the left here.
    const frame = (c: string): Frame => {
      const [strip, need] = [head(c) + PAD / 2, labels.get(c)!.width + 2 * PAD];
      return lr
        ? { container: c, top: PAD, left: strip, right: PAD, bottom: PAD, minW: 0, minH: need, strip: 'left' }
        : { container: c, top: strip, left: PAD, right: PAD, bottom: PAD, minW: need, minH: 0, strip: 'top' };
    };
    const containerOf = new Map(ir.nodes.map((n) => [n.id, n.parent]));
    // Saving space (URS-LY-014): tighter gaps along the drawn axes asked for; left to right swaps them.
    const tight = (axis: 'horizontal' | 'vertical') => ir.compact === 'both' || ir.compact === axis;
    const [tx, ty] = lr ? [tight('vertical'), tight('horizontal')] : [tight('horizontal'), tight('vertical')];
    const ctx: Ctx = {
      frame,
      gap: { sibling: tx ? TIGHT.sibling : GAP.sibling, indent: tx ? TIGHT.indent : GAP.indent, level: ty ? TIGHT.level : GAP.level, stacked: ty ? TIGHT.stacked : GAP.stacked },
    };

    // Containers a node enters below `outer` (its parent's), innermost first.
    const entering = (id: string, outer: string | undefined) => {
      const skip = new Set(chain(outer));
      return chain(containerOf.get(id)).filter((c) => !skip.has(c));
    };

    // Roots in source order; a cycle has none, so its first member becomes one.
    const seen = new Set<string>();
    const build = (id: string): Kid['block'] => {
      seen.add(id);
      const kids: Kid[] = (children.get(id) ?? [])
        .filter((c) => !seen.has(c))
        .map((c) => ({ block: build(c), edge: parent.get(c)!, chain: entering(c, containerOf.get(id)) }));
      return arrange(id, dims(id), kids, stack.get(id), ctx);
    };
    const roots: Kid[] = [];
    const grow = (id: string) => roots.push({ block: build(id), edge: -1, chain: entering(id, undefined) });
    for (const n of ir.nodes) if (!parent.has(n.id)) grow(n.id);
    for (const n of ir.nodes) if (!seen.has(n.id)) grow(n.id);
    // Top-level units side by side; roots in one container share its box.
    let x = 0;
    const placed = unitsOf(roots).map((u) => {
      const l = lay(u, 'row', ctx);
      const at = x;
      x += l.w + 2 * ctx.gap.sibling;
      return { b: l.drawn, at };
    });
    const flip = (p: Point): Point => (lr ? { x: p.y, y: p.x } : p);
    const pos = new Map(placed.flatMap(({ b, at }) => b.nodes.map((n) => [n.id, flip({ x: n.x + at, y: n.y })] as const)));
    const paths = new Map(placed.flatMap(({ b, at }) => b.paths.map((p) => [p.edge, p.points.map((q) => flip({ x: q.x + at, y: q.y }))] as const)));
    // A box wherever a container's people were framed together; people of one container under different
    // managers get a box each, so no box covers anyone between them. A box inside another of its own is dropped.
    const framed = placed.flatMap(({ b, at }) => b.boxes.map(({ container, box }) => ({ container, box: lr ? { x: box.y, y: box.x + at, w: box.h, h: box.w } : { ...box, x: box.x + at } })));
    const within = (a: Box, b: Box) => a !== b && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
    const placedContainers: PlacedContainer[] = ir.containers.flatMap((c) => {
      const own = framed.filter((f) => f.container === c.id).map((f) => f.box);
      return own.filter((box) => !own.some((o) => within(box, o))).map((box) => ({ id: c.id, lines: labels.get(c.id)!.lines, head: head(c.id), ...box, depth: chain(c.id).length - 1 }));
    });

    const nodes: PlacedNode[] = ir.nodes.map((n) => {
      const s = sizes.get(n.id)!;
      const p = pos.get(n.id)!;
      const c = s.callout;
      const callout = c && { ...c, x: p.x + s.w + CALLOUT_GAP, y: p.y + (s.h - c.h) / 2, leader: [p, p] as [Point, Point] };
      return { id: n.id, shape: n.shape, lines: s.lines, ...(s.sub && { sub: s.sub }), x: p.x, y: p.y, w: s.w, h: s.h, ...(callout && { callout }) };
    });
    const box = new Map(nodes.map((n) => [n.id, n]));
    const edges: RoutedEdge[] = ir.edges.flatMap((e, i) => {
      const [a, b] = [box.get(e.from), box.get(e.to)];
      if (!a || !b) return [];
      // Not a tree edge: a straight line between the two nodes.
      const points = paths.get(i) ?? [
        { x: a.x + a.w / 2, y: a.y + a.h / 2 },
        { x: b.x + b.w / 2, y: b.y + b.h / 2 },
      ];
      // Labels start on the segment nearest the child; placeLabels moves them clear and honours `at`.
      const [p, q] = [points.at(-2)!, points.at(-1)!];
      const labels = labelsOf(e).map(({ w, h, ...l }) => ({ ...l, x: (p.x + q.x - w) / 2, y: (p.y + q.y - h) / 2, w, h }));
      return [{ id: e.id, from: e.from, to: e.to, points, ...(e.marker && { marker: e.marker }), ...(labels.length && { labels }) }];
    });
    return { geometry: normalize(placeLabels({ bands: [], containers: placedContainers.sort((a, b) => a.depth - b.depth), nodes, edges })), diagnostics: [] };
  },
};
