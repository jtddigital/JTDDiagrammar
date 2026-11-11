/** Working graph for the layered engine: vertices are nodes or dummies; chains are edges split per layer. */
export interface Vertex {
  /** Index into IR nodes, or -1 for a dummy. */
  node: number;
  layer: number;
  /** Extent along the flow (main) and across it (cross). Dummies: 0 × 0. */
  main: number;
  cross: number;
  /** Cross-axis centre. */
  pos: number;
}

export interface Link {
  edge: number;
  u: number;
  v: number;
}

export interface Chain {
  edge: number;
  /** Drawn against the layer order (cycle back-edge). */
  reversed: boolean;
  /** Vertex indices in ascending layer order. */
  verts: number[];
}

export const isDummy = (v: Vertex) => v.node < 0;
