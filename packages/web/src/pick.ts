import type { GraphIR } from '@jtd/core';

/** Source pointer of a drawn element, by its SVG id prefix (URS-RN-005) and model id (URS-WEB-009). */
export function pointerOf(ir: GraphIR, kind: string, id: string): string | undefined {
  const list = { n: ir.nodes, c: ir.containers, e: ir.edges, l: ir.partitions?.lanes, p: ir.partitions?.phases }[kind];
  return list?.find((x) => x.id === id)?.src;
}
