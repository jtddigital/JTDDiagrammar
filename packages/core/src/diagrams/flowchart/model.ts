import { pointer } from '../../diagnostics.ts';
import type { Direction, EdgeLabel, Side, Style, Theme } from '../../ir/types.ts';
import type { StyleBy } from '../section-styles.ts';

export const FLOWCHART_SHAPES = ['process', 'decision', 'terminator', 'document', 'data', 'subprocess', 'connector', 'hexagon'] as const;
export type FlowchartShape = (typeof FLOWCHART_SHAPES)[number];

export interface FlowBand {
  id: string;
  label: string;
  style?: Style;
}

/** A connection from the node it is nested under (URS-IN-009). */
export interface FlowLink {
  id?: string;
  /** Target node id. */
  node: string;
  label?: string;
  /** More labels, optionally pinned along the line (URS-DM-024). */
  labels?: EdgeLabel[];
  /** Side of the source the line leaves by, and of the target it enters by (URS-DM-009). */
  exitSide?: Side;
  entrySide?: Side;
  quote?: string;
  style?: Style;
}

export interface FlowNode {
  id: string;
  shape?: FlowchartShape;
  label?: string;
  /** Who does it; shown under a divider (URS-DM-021) and matched by `styleBy.owner`. */
  owner?: string;
  lane?: string;
  phase?: string;
  order?: number;
  quote?: string;
  style?: Style;
  /** Outgoing connections. */
  to?: FlowLink[];
}

/** A note attached to a node, or free-standing (URS-DM-012). */
export interface FlowNote {
  id?: string;
  text: string;
  for?: string;
  lane?: string;
  phase?: string;
  style?: Style;
}

/** Source model. With `lanes` (and optional `phases`) it is a cross-functional flowchart (URS-TYP-002). */
export interface Flowchart {
  version: string;
  type: 'flowchart';
  title?: string;
  theme?: Theme;
  direction?: Direction;
  /** Default style per section (URS-DM-015). */
  styles?: Partial<Record<'lanes' | 'phases' | 'nodes' | 'notes', Style>>;
  /** Default style for every connection; each one's `style` overrides it (URS-DM-015). */
  edgeStyle?: Style;
  /** Node styles by shape and by owner (URS-DM-023). */
  styleBy?: StyleBy<'shape' | 'owner'>;
  lanes?: FlowBand[];
  phases?: FlowBand[];
  nodes: FlowNode[];
  notes?: FlowNote[];
}

/** A connection with its source, generated id and JSON Pointer. */
export interface FlatLink extends FlowLink {
  id: string;
  from: string;
  src: string;
}

/** Every connection in source order (URS-IN-009). Generated ids contain ':' so they cannot collide with user ids. */
export const linksOf = (m: Pick<Flowchart, 'nodes'>): FlatLink[] =>
  m.nodes.flatMap((n, i) => (n.to ?? []).map((l, j) => ({ ...l, id: l.id ?? `edge:${n.id}:${j}`, from: n.id, src: pointer('nodes', i, 'to', j) })));
