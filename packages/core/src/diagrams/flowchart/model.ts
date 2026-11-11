import type { Direction, Side, Style, Theme } from '../../ir/types.ts';

export const FLOWCHART_SHAPES = ['process', 'decision', 'terminator', 'document', 'data', 'subprocess', 'connector'] as const;
export type FlowchartShape = (typeof FLOWCHART_SHAPES)[number];

export interface FlowBand {
  id: string;
  label: string;
  style?: Style;
}

export interface FlowNode {
  id: string;
  shape?: FlowchartShape;
  label?: string;
  lane?: string;
  phase?: string;
  order?: number;
  quote?: string;
  style?: Style;
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  fromSide?: Side;
  toSide?: Side;
  quote?: string;
  style?: Style;
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
  lanes?: FlowBand[];
  phases?: FlowBand[];
  nodes: FlowNode[];
  edges?: FlowEdge[];
  notes?: FlowNote[];
}
