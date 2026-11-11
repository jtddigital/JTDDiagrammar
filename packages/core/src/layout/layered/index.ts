import { warning, type Diagnostic } from '../../diagnostics.ts';
import type { GraphIR } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import type { LayoutEngine } from '../../registry/layout-engine.ts';
import { shape } from '../../shapes/library.ts';
import { NODE_FONT, NODE_TEXT_MAX } from '../../style.ts';
import { flowOf, type Flow } from '../flow.ts';
import { normalize } from '../normalize.ts';
import { backEdges } from './cycles.ts';
import type { Chain, Link, Vertex } from './graph.ts';
import { order } from './order.ts';
import { place } from './place.ts';
import { rank } from './rank.ts';
import { route, type SizedNode } from './route.ts';

const unsupported = (ir: GraphIR): Diagnostic[] => [
  ...(ir.partitions ? [warning('layout.partitions', 'lanes and phases are not laid out yet; nodes are drawn without them')] : []),
  ...(ir.containers.length ? [warning('layout.containers', 'containers are not laid out yet')] : []),
];

/** Split each link into one segment per layer, inserting dummy vertices (Sugiyama). */
function build(nodes: readonly SizedNode[], ranks: readonly number[], dag: readonly Link[], back: ReadonlySet<number>, flow: Flow) {
  const verts: Vertex[] = nodes.map((n, i) => ({ node: i, layer: ranks[i]!, main: flow.main(n.w, n.h), cross: flow.cross(n.w, n.h), pos: 0 }));
  const chains: Chain[] = dag.map((l, i) => {
    const vs = [l.u];
    for (let r = ranks[l.u]! + 1; r < ranks[l.v]!; r++) vs.push(verts.push({ node: -1, layer: r, main: 0, cross: 0, pos: 0 }) - 1);
    return { edge: l.edge, reversed: back.has(i), verts: [...vs, l.v] };
  });
  const layers: number[][] = Array.from({ length: nodes.length ? Math.max(...ranks) + 1 : 0 }, () => []);
  verts.forEach((v, i) => layers[v.layer]!.push(i));
  return { verts, chains, layers };
}

/** Layered (Sugiyama-style) engine: cycles → rank → order → place → route (URS-LY-001..005). */
export const layered: LayoutEngine = {
  id: 'layered',
  layout(ir) {
    const flow = flowOf(ir.direction);
    const nodes: SizedNode[] = ir.nodes.map((n) => {
      const t = textBlock(n.label, NODE_TEXT_MAX, NODE_FONT);
      return { id: n.id, shape: n.shape, lines: t.lines, ...shape(n.shape).size(t.width, t.height) };
    });
    const index = new Map(ir.nodes.map((n, i) => [n.id, i]));
    const links: Link[] = [];
    const loops: { edge: number; node: number }[] = [];
    ir.edges.forEach((e, edge) => {
      const [u, v] = [index.get(e.from), index.get(e.to)];
      if (u === undefined || v === undefined) return; // container endpoints: P5
      if (u === v) loops.push({ edge, node: u });
      else links.push({ edge, u, v });
    });

    const back = backEdges(nodes.length, links);
    const dag = links.map((l, i) => (back.has(i) ? { edge: l.edge, u: l.v, v: l.u } : l));
    const { verts, chains, layers } = build(nodes, rank(nodes.length, dag), dag, back, flow);
    order(layers, verts, chains);
    place(layers, verts, chains);
    const routed = route({ flow, nodes, verts, layers, chains, edges: ir.edges, loops });
    return { geometry: normalize(routed.nodes, routed.edges), diagnostics: unsupported(ir) };
  },
};
