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
  /** Text (URS-DM-016). */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
  /** Edges (URS-DM-016). */
  arrowhead?: 'triangle' | 'open' | 'diamond' | 'circle' | 'none';
  labelFill?: string;
  /** Nodes: label placement and fixed size (URS-DM-017). */
  label?: 'inside' | 'callout' | 'auto';
  width?: number;
  height?: number;
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
  /** Secondary text under a divider, e.g. who owns a task (URS-DM-021). */
  sub?: string;
  badges?: Badge[];
  parent?: string;
  order?: number;
  lane?: string;
  phase?: string;
  /**
   * Tree layout: put this node's children in this many stacks (columns, or rows across the flow); 0 keeps
   * them in one row. Unset: one row, or with `compact`, whichever arrangement fits best (URS-LY-014).
   */
  stack?: number;
}

/** Small pictograms for badges, edge labels and legends (URS-DM-025). */
export const ICONS = ['signature', 'clock', 'timer', 'all', 'any', 'each'] as const;
export type Icon = (typeof ICONS)[number];

/** A marker on a node's top edge: an icon, short text, or both (URS-DM-025). */
export interface Badge {
  icon?: Icon;
  text?: string;
}

/** Text on an edge; `at` pins it at that percentage of the edge's length, else it is placed clear of other things (URS-DM-024). */
export interface EdgeLabel {
  text: string;
  at?: number;
  /** Drawn before the text (URS-DM-025). */
  icon?: Icon;
}

/** One legend entry: a shape, an icon or a line sample, and its meaning (URS-DM-026). */
export interface LegendItem {
  label: string;
  shape?: string;
  icon?: Icon;
  /** A line sample in this style. */
  line?: Style;
  style?: Style;
}

export interface IREdge extends Sourced {
  id: string;
  from: string;
  to: string;
  labels?: EdgeLabel[];
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
  /** Smaller text under the header label, e.g. entry criteria (URS-DM-020). */
  detail?: string;
}

/** A header spanning adjacent lanes or phases, e.g. a lifecycle stage over its states (URS-DM-019). */
export interface BandGroup extends Sourced {
  id: string;
  label: string;
  /** Member band ids, adjacent and in band order. */
  members: string[];
}

/** Lanes × phases (URS-DM-001/002). When present, every node must name a lane (URS-DM-005). */
export interface Partitions {
  lanes: Band[];
  phases?: Band[];
  laneGroups?: BandGroup[];
  phaseGroups?: BandGroup[];
}

export interface GraphIR {
  title?: string;
  theme?: Theme;
  direction: Direction;
  nodes: IRNode[];
  edges: IREdge[];
  containers: IRContainer[];
  partitions?: Partitions;
  /** Drawn under the diagram (URS-DM-026). */
  legend?: LegendItem[];
  /** Title block: key–value pairs under the title (URS-DM-027). */
  meta?: [string, string][];
  /** Save space along these drawn axes: tighter spacing there, and subtrees rearranged to fit (URS-LY-014). */
  compact?: Compact;
}

export type Compact = 'horizontal' | 'vertical' | 'both';
