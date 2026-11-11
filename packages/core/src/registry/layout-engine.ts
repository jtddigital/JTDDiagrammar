import type { Diagnostic } from '../diagnostics.ts';
import type { Geometry } from '../geometry.ts';
import type { GraphIR } from '../ir/types.ts';

export interface LayoutResult {
  geometry: Geometry;
  diagnostics: Diagnostic[];
}

export interface LayoutEngine {
  id: string;
  layout(ir: GraphIR): LayoutResult;
}
