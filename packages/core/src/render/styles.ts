import type { Geometry } from '../geometry.ts';
import type { GraphIR, Style } from '../ir/types.ts';

/** Attach IR styles, quotes, markers and theme to engine output by id, so layout engines never deal with presentation (URS-DM-010, URS-AI-014). */
export function applyStyles(g: Geometry, ir: GraphIR): Geometry {
  const by = (items: readonly { id: string; style?: Style }[]) => new Map(items.filter((i) => i.style).map((i) => [i.id, i.style!]));
  const [nodes, edges, containers] = [by(ir.nodes), by(ir.edges), by(ir.containers)];
  const bands = by([...(ir.partitions?.lanes ?? []), ...(ir.partitions?.phases ?? [])]);
  const markers = new Set(ir.edges.filter((e) => e.marker === 'none').map((e) => e.id));
  const quotes = new Map([...ir.nodes, ...ir.edges].filter((i) => i.quote).map((i) => [i.id, i.quote!]));
  const withStyle = <T extends { id: string }>(x: T, m: Map<string, Style>): T => {
    const styled = m.has(x.id) ? { ...x, style: m.get(x.id)! } : x;
    return quotes.has(x.id) ? { ...styled, quote: quotes.get(x.id)! } : styled;
  };
  return {
    ...g,
    ...(ir.theme && { theme: ir.theme }),
    nodes: g.nodes.map((n) => withStyle(n, nodes)),
    edges: g.edges.map((e) => {
      const styled = withStyle(e, edges);
      return markers.has(e.id) ? { ...styled, marker: 'none' as const } : styled;
    }),
    containers: g.containers.map((c) => withStyle(c, containers)),
    bands: g.bands.map((b) => withStyle(b, bands)),
  };
}
