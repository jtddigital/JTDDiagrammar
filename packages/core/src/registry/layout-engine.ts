import type { GraphIR } from '../ir/types.ts';

/** Positioned output of a layout engine. Defined concretely in P1 (URS-LY-*). */
export type Geometry = unknown;

export interface LayoutEngine {
  id: string;
  layout(ir: GraphIR): Geometry;
}
