import type { IRNode } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import { shape } from '../../shapes/library.ts';
import { NODE_FONT, NODE_TEXT_MAX } from '../../style.ts';
import type { Flow } from '../flow.ts';
import type { Chain, Link, Vertex } from './graph.ts';
import type { SizedNode } from './route.ts';

/** Measure a node's label and size its shape. */
export function sized(n: IRNode): SizedNode {
  const t = textBlock(n.label, NODE_TEXT_MAX, NODE_FONT);
  return { id: n.id, shape: n.shape, lines: t.lines, ...shape(n.shape).size(t.width, t.height), ...(n.order !== undefined && { order: n.order }) };
}

/** Split each link into one segment per layer, inserting dummy vertices (Sugiyama). Dummies join the lane of the chain's first vertex. */
export function build(nodes: readonly SizedNode[], laneOf: readonly number[], ranks: readonly number[], layerCount: number, dag: readonly Link[], back: ReadonlySet<number>, flow: Flow) {
  const verts: Vertex[] = nodes.map((n, i) => ({
    node: i,
    layer: ranks[i]!,
    group: laneOf[i]!,
    main: flow.main(n.w, n.h),
    cross: flow.cross(n.w, n.h),
    pos: 0,
    ...(n.order !== undefined && { hint: n.order }),
  }));
  const chains: Chain[] = dag.map((l, i) => {
    const vs = [l.u];
    for (let r = ranks[l.u]! + 1; r < ranks[l.v]!; r++) vs.push(verts.push({ node: -1, layer: r, group: laneOf[l.u]!, main: 0, cross: 0, pos: 0 }) - 1);
    return { edge: l.edge, reversed: back.has(i), verts: [...vs, l.v] };
  });
  const layers: number[][] = Array.from({ length: layerCount }, () => []);
  verts.forEach((v, i) => layers[v.layer]!.push(i));
  return { verts, chains, layers };
}
