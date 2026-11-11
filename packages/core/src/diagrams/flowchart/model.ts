import type { Direction, Style, Theme } from '../../ir/types.ts';

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
  style?: Style;
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
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
}
