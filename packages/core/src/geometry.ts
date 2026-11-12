import type { Badge, Icon, Style, Theme } from './ir/types.ts';

/** Positioned output of a layout engine; the renderer's only input (URS-EXT-004). */
export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A node label drawn beside a fixed-size node, joined to it by a leader line (URS-DM-017). */
export interface Callout extends Box {
  lines: string[];
  sub?: string[];
  /** Leader line from the node's outline to the callout. */
  leader: [Point, Point];
}

export interface PlacedNode extends Box {
  id: string;
  style?: Style;
  quote?: string;
  shape: string;
  lines: string[];
  /** Secondary text under a divider (URS-DM-021). */
  sub?: string[];
  badges?: Badge[];
  callout?: Callout;
}

/** A placed edge label; `at` (percent of the edge's length) pins it (URS-DM-024). */
export interface LabelBox extends Box {
  lines: string[];
  at?: number;
  icon?: Icon;
}

export interface RoutedEdge {
  id: string;
  style?: Style;
  quote?: string;
  marker?: 'none';
  from: string;
  to: string;
  points: Point[];
  labels?: LabelBox[];
}

/** A lane or phase: the full band area plus its header cell (URS-DM-001/002). */
export interface PlacedBand extends Box {
  id: string;
  style?: Style;
  /** Groups are header cells only: their box equals their header (URS-DM-019). */
  kind: 'lane' | 'phase' | 'laneGroup' | 'phaseGroup';
  lines: string[];
  /** Smaller text under the label (URS-DM-020). */
  detail?: string[];
  header: Box;
}

/** A composite region, e.g. a composite state (URS-DM-013). Outer containers have lower depth. */
export interface PlacedContainer extends Box {
  id: string;
  style?: Style;
  lines: string[];
  /** Height of the label strip at the top. */
  head: number;
  depth: number;
}

export interface Geometry {
  theme?: Theme;
  width: number;
  height: number;
  bands: PlacedBand[];
  /** Empty header cell where lane and phase headers meet. */
  corner?: Box;
  /** Empty group-header cells over ungrouped bands (URS-DM-019). */
  fillers?: Box[];
  containers: PlacedContainer[];
  nodes: PlacedNode[];
  edges: RoutedEdge[];
  legend?: PlacedLegend;
}

/** The legend box under the diagram (URS-DM-026): each entry's sample box and text. */
export interface PlacedLegend extends Box {
  items: { sample: Box; text: Box & { lines: string[] }; label: string; shape?: string; icon?: Icon; line?: Style; style?: Style }[];
}
