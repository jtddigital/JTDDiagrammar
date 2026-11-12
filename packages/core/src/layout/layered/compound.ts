import { warning, type Diagnostic } from '../../diagnostics.ts';
import type { Box, PlacedContainer, PlacedNode, Point, RoutedEdge } from '../../geometry.ts';
import type { GraphIR, IREdge } from '../../ir/types.ts';
import { max, min } from '../../math.ts';
import { textBlock, type TextBlock } from '../../measure/text.ts';
import type { LayoutResult } from '../../registry/layout-engine.ts';
import { CONTAINER_FONT, CONTAINER_HEAD_PAD as HEAD_PAD, CONTAINER_TEXT_MAX, fontOf } from '../../style.ts';
import type { Flow } from '../flow.ts';
import { placeLabels } from '../labels.ts';
import { hintsOf, polish } from '../polish.ts';
import { normalize } from '../normalize.ts';
import { simplify } from '../simplify.ts';
import { build, sized } from './build.ts';
import type { Link } from './graph.ts';
import { layering, type Layering } from './layering.ts';
import { order } from './order.ts';
import { place } from './place.ts';
import { route, type MC, type SizedNode } from './route.ts';

/** Container padding (px) on the sides without the label. */
const PAD = 14;

type Scope = string | null; // container id, or null for the top level
type Side = 'start' | 'end'; // flow start or end side of a container

type Item = { kind: 'node'; id: string; node: number } | { kind: 'container'; id: string } | { kind: 'port'; id: string; edge: number; side: Side };

interface Level {
  items: Item[];
  links: Link[];
  loops: { edge: number; node: number }[];
  lay?: Layering;
}

/** How an edge crosses the hierarchy: drawn at its lowest common scope, with ports on every container border it crosses. */
interface Plan {
  edge: number;
  lca: Scope;
  /** Containers around `from` below the lca, innermost first; likewise around `to`. */
  upFrom: string[];
  upTo: string[];
}

interface Placed {
  w: number;
  h: number;
  label?: TextBlock;
  head?: number;
  /** Border attachment per crossing edge, in this container's local flow coordinates. */
  ports: Map<number, MC>;
  nodes: PlacedNode[];
  containers: Map<string, Box>;
  /** One piece per edge drawn at this level, oriented from `from` to `to`. */
  pieces: Map<number, { points: Point[]; labels?: RoutedEdge['labels'] }>;
}

const translate = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy });

/**
 * Compound layout (URS-LY-012, URS-DM-013), hierarchical-port style:
 * 1. top-down, each scope is ranked with crossing edges attached to border ports (entry ports in a
 *    first phase, exit ports in a last phase), the side being fixed by the ranking at the edge's lowest common scope;
 * 2. bottom-up, each scope is laid out with child containers as sized boxes whose crossing edges attach
 *    at the exact border points the child produced;
 * 3. each edge is stitched from its pieces, innermost on the source side to innermost on the target side.
 */
export function compound(ir: GraphIR, flow: Flow): LayoutResult {
  const diagnostics: Diagnostic[] = [];
  const parent = new Map<string, Scope>([...ir.nodes, ...ir.containers].map((e) => [e.id, e.parent ?? null]));
  const ancestors = (id: string): Scope[] => {
    const out: Scope[] = [];
    for (let p = parent.get(id) ?? null; ; p = parent.get(p) ?? null) {
      out.push(p);
      if (p === null || out.length > parent.size) return out;
    }
  };

  // Scopes in top-down order.
  const scopes: Scope[] = [null];
  for (let i = 0; i < scopes.length; i++) scopes.push(...ir.containers.filter((c) => (c.parent ?? null) === scopes[i]).map((c) => c.id));
  const depth = new Map(scopes.map((s) => [s, s === null ? 0 : ancestors(s).length]));
  const levels = new Map<Scope, Level>(scopes.map((s) => [s, { items: [], links: [], loops: [] }]));
  const itemIndex = new Map<Scope, Map<string, number>>(scopes.map((s) => [s, new Map()]));
  const add = (s: Scope, item: Item) => {
    itemIndex.get(s)!.set(item.id, levels.get(s)!.items.push(item) - 1);
  };
  ir.nodes.forEach((n, i) => add(n.parent ?? null, { kind: 'node', id: n.id, node: i }));
  ir.containers.forEach((c) => add(c.parent ?? null, { kind: 'container', id: c.id }));

  // Plan every edge.
  const plans: Plan[] = [];
  ir.edges.forEach((e, edge) => {
    if (!parent.has(e.from) || !parent.has(e.to)) return;
    if (e.from === e.to) {
      const s = parent.get(e.from)!;
      levels.get(s)!.loops.push({ edge, node: itemIndex.get(s)!.get(e.from)! });
      return;
    }
    const [ancF, ancT] = [ancestors(e.from), ancestors(e.to)];
    if (ancF.includes(e.to) || ancT.includes(e.from)) {
      diagnostics.push(warning('layout.edge-into-container', `edge '${e.id}' connects a container to its own content and is not drawn`, e.src));
      return;
    }
    const lca = ancF.find((s) => ancT.includes(s)) ?? null;
    plans.push({ edge, lca, upFrom: ancF.slice(0, ancF.indexOf(lca)) as string[], upTo: ancT.slice(0, ancT.indexOf(lca)) as string[] });
  });
  /** The element directly under scope `s` on the way to the edge's `from` or `to`. */
  const lifted = (p: Plan, s: Scope, end: 'from' | 'to') => {
    const id = ir.edges[p.edge]![end];
    const ids: (string | null)[] = [id, ...ancestors(id)];
    return ids[ids.indexOf(s) - 1] as string;
  };

  // 1. Top-down: items, links and ranking per scope; sides of crossing edges.
  const sides = new Map<number, { from: Side; to: Side }>();
  for (const s of scopes) {
    const level = levels.get(s)!;
    const idx = itemIndex.get(s)!;
    for (const p of plans) {
      if (p.lca === s) level.links.push({ edge: p.edge, u: idx.get(lifted(p, s, 'from'))!, v: idx.get(lifted(p, s, 'to'))! });
      if (s !== null && p.upFrom.includes(s)) {
        add(s, { kind: 'port', id: `port:${p.edge}`, edge: p.edge, side: sides.get(p.edge)!.from });
        level.links.push({ edge: p.edge, u: idx.get(lifted(p, s, 'from'))!, v: idx.get(`port:${p.edge}`)! });
      }
      if (s !== null && p.upTo.includes(s)) {
        add(s, { kind: 'port', id: `port:${p.edge}`, edge: p.edge, side: sides.get(p.edge)!.to });
        level.links.push({ edge: p.edge, u: idx.get(`port:${p.edge}`)!, v: idx.get(lifted(p, s, 'to'))! });
      }
    }
    const hasStart = level.items.some((i) => i.kind === 'port' && i.side === 'start');
    const hasEnd = level.items.some((i) => i.kind === 'port' && i.side === 'end');
    const content = hasStart ? 1 : 0;
    const phaseOf = level.items.map((i) => (i.kind !== 'port' ? content : i.side === 'start' ? 0 : content + 1));
    level.lay = layering(level.items.length, level.links, phaseOf, content + 1 + (hasEnd ? 1 : 0));
    level.links.forEach((l, k) => {
      const plan = plans.find((p) => p.edge === l.edge && p.lca === s);
      if (plan) sides.set(l.edge, level.lay!.back.has(k) ? { from: 'start', to: 'end' } : { from: 'end', to: 'start' });
    });
  }

  // 2. Bottom-up layout.
  const placed = new Map<Scope, Placed>();
  const containerById = new Map(ir.containers.map((c) => [c.id, c]));
  for (const s of [...scopes].reverse()) {
    const level = levels.get(s)!;
    const lay = level.lay!;
    const nodes: SizedNode[] = level.items.map((it) => {
      if (it.kind === 'node') return sized(ir.nodes[it.node]!);
      if (it.kind === 'port') return { id: it.id, shape: 'port', lines: [], w: 0, h: 0 };
      const c = placed.get(it.id)!;
      return { id: it.id, shape: 'container', lines: [], w: c.w, h: c.h };
    });
    // Labels belong to the piece drawn at the edge's lowest common scope.
    const labelledHere = (i: number) => plans.some((p) => p.edge === i && p.lca === s) || level.loops.some((l) => l.edge === i);
    const edges: IREdge[] = ir.edges.map((e, i) => (labelledHere(i) || !e.labels ? e : { id: e.id, from: e.from, to: e.to }));
    const { verts, chains, layers } = build(nodes, nodes.map(() => 0), lay.ranks, lay.phases.at(-1)!.last + 1, lay.dag, lay.back, flow);
    order(layers, verts, chains);
    place(layers, verts, chains);
    const routed = route({
      flow,
      nodes,
      verts,
      layers,
      chains,
      edges,
      loops: level.loops,
      fixed: (edge, node) => {
        const it = level.items[node]!;
        return it.kind === 'container' ? placed.get(it.id)!.ports.get(edge) : undefined;
      },
    });

    const at = new Map(routed.nodes.map((n) => [n.id, n]));
    const pieces = new Map<number, { points: Point[]; labels?: RoutedEdge['labels'] }>();
    const edgeIndex = new Map(ir.edges.map((e, i) => [e.id, i]));
    for (const r of routed.edges) pieces.set(edgeIndex.get(r.id)!, { points: r.points, ...(r.labels && { labels: r.labels }) });

    let label: TextBlock | undefined;
    let [w, h, dx, dy] = [0, 0, 0, 0];
    if (s !== null) {
      // Size the container around its content; the label sits at the top.
      const c = containerById.get(s)!;
      label = textBlock(c.label ?? '', CONTAINER_TEXT_MAX, fontOf(CONTAINER_FONT, c.style));
      const boxes: Box[] = [...routed.nodes, ...routed.nodes.flatMap((n) => (n.callout ? [n.callout] : [])), ...[...pieces.values()].flatMap((p) => [...p.points.map((q) => ({ ...q, w: 0, h: 0 })), ...(p.labels ?? [])])];
      const [x0, y0] = [min(boxes.map((b) => b.x)), min(boxes.map((b) => b.y))];
      const [cw, ch] = [max(boxes.map((b) => b.x + b.w)) - x0, max(boxes.map((b) => b.y + b.h)) - y0];
      const top = label.height + 2 * HEAD_PAD;
      w = Math.max(cw + 2 * PAD, label.width + 2 * PAD);
      h = ch + top + PAD;
      dx = (w - cw) / 2 - x0;
      dy = top - y0;
    }
    const nodesOut = level.items.flatMap((it) => (it.kind === 'node' ? [moveNode(at.get(it.id)!, dx, dy)] : []));
    const containers = new Map(level.items.flatMap((it) => (it.kind === 'container' ? [[it.id, { ...at.get(it.id)!, x: at.get(it.id)!.x + dx, y: at.get(it.id)!.y + dy }] as const] : [])));
    for (const [e, p] of pieces) pieces.set(e, { points: p.points.map((q) => translate(q, dx, dy)), ...(p.labels && { labels: p.labels.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy })) }) });

    // Border ports: extend each crossing piece to the border and record where the parent must attach.
    const ports = new Map<number, MC>();
    for (const it of level.items) {
      if (it.kind !== 'port') continue;
      const p = translate(at.get(it.id)!, dx, dy);
      const fixed = { m: it.side === 'start' ? 0 : flow.main(w, h), c: flow.local(p).c };
      const border = flow.toXY(fixed.m, fixed.c);
      ports.set(it.edge, fixed);
      const piece = pieces.get(it.edge)!;
      const outgoing = plans.find((pl) => pl.edge === it.edge)!.upFrom.includes(s as string);
      piece.points = outgoing ? [...piece.points, border] : [border, ...piece.points];
    }
    placed.set(s, { w, h, ...(label && { label, head: label.height + 2 * HEAD_PAD }), ports, nodes: nodesOut, containers, pieces });
  }

  // 3. Absolute positions, top-down.
  const offset = new Map<Scope, Point>([[null, { x: 0, y: 0 }]]);
  const nodes: PlacedNode[] = [];
  const containers: PlacedContainer[] = [];
  for (const s of scopes) {
    const o = offset.get(s)!;
    const p = placed.get(s)!;
    nodes.push(...p.nodes.map((n) => moveNode(n, o.x, o.y)));
    for (const [id, b] of p.containers) {
      const abs = translate(b, o.x, o.y);
      offset.set(id, abs);
      const inner = placed.get(id)!;
      containers.push({ id, lines: inner.label?.lines ?? [], head: inner.head ?? 2 * HEAD_PAD, ...abs, w: b.w, h: b.h, depth: depth.get(id)! });
    }
  }
  const piece = (s: Scope, edge: number) => {
    const o = offset.get(s)!;
    const p = placed.get(s)!.pieces.get(edge)!;
    return { points: p.points.map((q) => translate(q, o.x, o.y)), ...(p.labels && { labels: p.labels.map((l) => ({ ...l, x: l.x + o.x, y: l.y + o.y })) }) };
  };

  const drawn = new Map<number, RoutedEdge>();
  for (const p of plans) {
    const e = ir.edges[p.edge]!;
    const main = piece(p.lca, p.edge);
    const points = [...p.upFrom.flatMap((s) => piece(s, p.edge).points), ...main.points, ...[...p.upTo].reverse().flatMap((s) => piece(s, p.edge).points)];
    drawn.set(p.edge, { id: e.id, from: e.from, to: e.to, points: simplify(points), ...(main.labels && { labels: main.labels }) });
  }
  for (const s of scopes)
    for (const l of levels.get(s)!.loops) {
      const p = piece(s, l.edge);
      const e = ir.edges[l.edge]!;
      drawn.set(l.edge, { id: e.id, from: e.from, to: e.to, points: p.points, ...(p.labels && { labels: p.labels }) });
    }
  const edges = [...drawn.entries()].sort(([a], [b]) => a - b).map(([, e]) => e);
  return { geometry: normalize(placeLabels(polish({ bands: [], containers: containers.sort((a, b) => a.depth - b.depth), nodes, edges }, hintsOf(ir)))), diagnostics };
}

/** A placed node moved by (dx, dy), its callout with it. */
const moveNode = (n: PlacedNode, dx: number, dy: number): PlacedNode => ({
  ...n,
  x: n.x + dx,
  y: n.y + dy,
  ...(n.callout && { callout: { ...n.callout, x: n.callout.x + dx, y: n.callout.y + dy, leader: [translate(n.callout.leader[0], dx, dy), translate(n.callout.leader[1], dx, dy)] } }),
});
