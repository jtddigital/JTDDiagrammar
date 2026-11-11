/** Shared Graph IR: the only structure layout and render may consume (URS-EXT-004). */
export type Direction = 'LR' | 'TB';
export type Theme = 'default' | 'dark';

/** Style overrides (URS-DM-010); colours are validated hex strings. */
export interface Style {
  fill?: string;
  stroke?: string;
  text?: string;
  dash?: 'solid' | 'dashed' | 'dotted';
}

/** JSON Pointer to the source element, for diagnostics. */
interface Sourced {
  src?: string;
  style?: Style;
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
