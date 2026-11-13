import type { PlacedNode, Point, RoutedEdge } from '../../geometry.ts';
import type { GraphIR } from '../../ir/types.ts';
import type { LayoutEngine } from '../../registry/layout-engine.ts';
import { CALLOUT_GAP } from '../../style.ts';
import { placeLabels } from '../labels.ts';
import { sized } from '../layered/build.ts';
import { labelsOf } from '../layered/route.ts';
import { normalize } from '../normalize.ts';
import { arrange, GAP } from './arrange.ts';
import type { Block } from './block.ts';

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

    // Roots in source order; a cycle has none, so its first member becomes one.
    const seen = new Set<string>();
    const build = (id: string): Block => {
      seen.add(id);
      const kids = (children.get(id) ?? []).filter((c) => !seen.has(c)).map((c) => ({ block: build(c), edge: parent.get(c)! }));
      return arrange(id, dims(id), kids, stack.get(id));
    };
    const roots: Block[] = [];
    for (const n of ir.nodes) if (!parent.has(n.id) && !seen.has(n.id)) roots.push(build(n.id));
    for (const n of ir.nodes) if (!seen.has(n.id)) roots.push(build(n.id));

    let x = 0;
    const placed = roots.flatMap((b) => {
      const at = x;
      x += b.w + 2 * GAP.sibling;
      return [{ b, at }];
    });
    const flip = (p: Point): Point => (lr ? { x: p.y, y: p.x } : p);
    const pos = new Map(placed.flatMap(({ b, at }) => b.nodes.map((n) => [n.id, flip({ x: n.x + at, y: n.y })] as const)));
    const paths = new Map(placed.flatMap(({ b, at }) => b.paths.map((p) => [p.edge, p.points.map((q) => flip({ x: q.x + at, y: q.y }))] as const)));

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
    return { geometry: normalize(placeLabels({ bands: [], containers: [], nodes, edges })), diagnostics: [] };
  },
};
