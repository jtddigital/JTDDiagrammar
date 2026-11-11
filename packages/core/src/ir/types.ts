/** Shared Graph IR: the only structure layout and render may consume (URS-EXT-004). */
export type Direction = 'LR' | 'TB';
export type Theme = 'default' | 'dark';
/** A node side in drawing terms (north = top). */
export type Side = 'N' | 'E' | 'S' | 'W';

/** Style overrides (URS-DM-010); colours are validated hex strings. */
export interface Style {
  fill?: string;
  stroke?: string;
  text?: string;
  dash?: 'solid' | 'dashed' | 'dotted';
  /** Line thickness in px, 0.5–8 (URS-DM-014). */
  lineWidth?: number;
}

/** JSON Pointer to the source element, for diagnostics. */
interface Sourced {
  src?: string;
  style?: Style;
  /** Supporting excerpt from the material it was generated from (URS-AI-014). */
  quote?: string;
}

export interface IRNode extends Sourced {
  id: string;
  shape: string;
  label: string;
  parent?: string;
  order?: number;
  lane?: string;
  phase?: string;
}

export interface IREdge extends Sourced {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Sides to leave `from` / enter `to` by (URS-DM-009). */
  ports?: { from?: Side; to?: Side };
  /** End marker; default arrow. */
  marker?: 'none';
}

export interface IRContainer extends Sourced {
  id: string;
  label?: string;
  parent?: string;
}

export interface Band extends Sourced {
  id: string;
  label: string;
}

/** Lanes × phases (URS-DM-001/002). When present, every node must name a lane (URS-DM-005). */
export interface Partitions {
  lanes: Band[];
  phases?: Band[];
}

export interface GraphIR {
  title?: string;
  theme?: Theme;
  direction: Direction;
  nodes: IRNode[];
  edges: IREdge[];
  containers: IRContainer[];
  partitions?: Partitions;
}
