import type { Geometry } from '../geometry.ts';
import type { GraphIR, Style } from '../ir/types.ts';

/** Attach IR styles and theme to engine output by id, so layout engines never deal with styling (URS-DM-010). */
export function applyStyles(g: Geometry, ir: GraphIR): Geometry {
  const by = (items: readonly { id: string; style?: Style }[]) => new Map(items.filter((i) => i.style).map((i) => [i.id, i.style!]));
  const [nodes, edges, containers] = [by(ir.nodes), by(ir.edges), by(ir.containers)];
  const bands = by([...(ir.partitions?.lanes ?? []), ...(ir.partitions?.phases ?? [])]);
  const withStyle = <T extends { id: string }>(x: T, m: Map<string, Style>): T => (m.has(x.id) ? { ...x, style: m.get(x.id)! } : x);
  return {
    ...g,
    ...(ir.theme && { theme: ir.theme }),
    nodes: g.nodes.map((n) => withStyle(n, nodes)),
    edges: g.edges.map((e) => withStyle(e, edges)),
    containers: g.containers.map((c) => withStyle(c, containers)),
    bands: g.bands.map((b) => withStyle(b, bands)),
  };
}
