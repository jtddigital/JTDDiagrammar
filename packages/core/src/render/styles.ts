import type { Geometry } from '../geometry.ts';
import type { GraphIR, Style } from '../ir/types.ts';

/** Attach IR styles, quotes, badges, markers and theme to engine output by id, so layout engines never deal with presentation (URS-DM-010, URS-AI-014). */
export function applyStyles(g: Geometry, ir: GraphIR): Geometry {
  const by = (items: readonly { id: string; style?: Style }[]) => new Map(items.filter((i) => i.style).map((i) => [i.id, i.style!]));
  const [nodes, edges, containers] = [by(ir.nodes), by(ir.edges), by(ir.containers)];
  // Keyed by kind as well: a group may share an id with a band.
  const p = ir.partitions;
  const keyed = (kind: string, bs: readonly { id: string; style?: Style }[] | undefined) => (bs ?? []).map((x) => ({ ...x, id: `${kind}:${x.id}` }));
  const bands = by([...keyed('lane', p?.lanes), ...keyed('phase', p?.phases), ...keyed('laneGroup', p?.laneGroups), ...keyed('phaseGroup', p?.phaseGroups)]);
  const markers = new Set(ir.edges.filter((e) => e.marker === 'none').map((e) => e.id));
  const quotes = new Map([...ir.nodes, ...ir.edges].filter((i) => i.quote).map((i) => [i.id, i.quote!]));
  const badges = new Map(ir.nodes.filter((n) => n.badges?.length).map((n) => [n.id, n.badges!]));
  const withStyle = <T extends { id: string }>(x: T, m: Map<string, Style>): T => {
    const styled = m.has(x.id) ? { ...x, style: m.get(x.id)! } : x;
    return quotes.has(x.id) ? { ...styled, quote: quotes.get(x.id)! } : styled;
  };
  return {
    ...g,
    ...(ir.theme && { theme: ir.theme }),
    nodes: g.nodes.map((n) => (badges.has(n.id) ? { ...withStyle(n, nodes), badges: badges.get(n.id)! } : withStyle(n, nodes))),
    edges: g.edges.map((e) => {
      const styled = withStyle(e, edges);
      return markers.has(e.id) ? { ...styled, marker: 'none' as const } : styled;
    }),
    containers: g.containers.map((c) => withStyle(c, containers)),
    bands: g.bands.map((b) => {
      const s = bands.get(`${b.kind}:${b.id}`);
      return s ? { ...b, style: s } : b;
    }),
  };
}
