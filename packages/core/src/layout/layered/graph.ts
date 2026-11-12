/** Working graph for the layered engine: vertices are nodes or dummies; chains are edges split per layer. */
export interface Vertex {
  /** Index into IR nodes, or -1 for a dummy. */
  node: number;
  layer: number;
  /** Lane index (0 when unpartitioned). Ordering and placement never mix groups. */
  group: number;
  /** Extent along the flow (main) and across it (cross). Dummies: 0 × 0. */
  main: number;
  cross: number;
  /** Cross-axis centre. */
  pos: number;
  /** Ordering hint within its layer and lane (URS-DM-008). */
  hint?: number;
  /** Room reserved past the shape on the cross axis, and the length needed along the flow, for a callout (URS-DM-017). */
  after?: number;
  reach?: number;
  /** Edges attach at the shape's tips (diamonds), so any of them can run straight from the centre. */
  tips?: boolean;
}

export interface Link {
  edge: number;
  u: number;
  v: number;
}

export interface Chain {
  edge: number;
  /** Drawn against the layer order (cycle back-edge or edge into an earlier phase). */
  reversed: boolean;
  /** Vertex indices in ascending layer order. */
  verts: number[];
}

export interface Span {
  start: number;
  end: number;
}

export const isDummy = (v: Vertex) => v.node < 0;
