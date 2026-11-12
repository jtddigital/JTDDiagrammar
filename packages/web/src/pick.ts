import type { GraphIR } from '@jtd/core';

/** Source pointer of a drawn element, by its SVG id prefix (URS-RN-005) and model id (URS-WEB-009). */
export function pointerOf(ir: GraphIR, kind: string, id: string): string | undefined {
  const p = ir.partitions;
  const list = { n: ir.nodes, c: ir.containers, e: ir.edges, l: p?.lanes, p: p?.phases, lg: p?.laneGroups, pg: p?.phaseGroups }[kind];
  return list?.find((x) => x.id === id)?.src;
}
