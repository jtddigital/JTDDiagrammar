import type { Direction } from '../../ir/types.ts';

export const FLOWCHART_SHAPES = ['process', 'decision', 'terminator', 'document', 'data', 'subprocess', 'connector'] as const;
export type FlowchartShape = (typeof FLOWCHART_SHAPES)[number];

export interface FlowBand {
  id: string;
  label: string;
}

export interface FlowNode {
  id: string;
  shape?: FlowchartShape;
  label?: string;
  lane?: string;
  phase?: string;
  order?: number;
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
}

/** Source model. With `lanes` (and optional `phases`) it is a cross-functional flowchart (URS-TYP-002). */
export interface Flowchart {
  version: string;
  type: 'flowchart';
  title?: string;
  direction?: Direction;
  lanes?: FlowBand[];
  phases?: FlowBand[];
  nodes: FlowNode[];
  edges?: FlowEdge[];
}
