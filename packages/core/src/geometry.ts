import type { Style, Theme } from './ir/types.ts';

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

export interface PlacedNode extends Box {
  id: string;
  style?: Style;
  shape: string;
  lines: string[];
}

export interface RoutedEdge {
  id: string;
  style?: Style;
  from: string;
  to: string;
  points: Point[];
  label?: Box & { lines: string[] };
}

/** A lane or phase: the full band area plus its header cell (URS-DM-001/002). */
export interface PlacedBand extends Box {
  id: string;
  style?: Style;
  kind: 'lane' | 'phase';
  lines: string[];
  header: Box;
}

/** A composite region, e.g. a composite state (URS-DM-013). Outer containers have lower depth. */
export interface PlacedContainer extends Box {
  id: string;
  style?: Style;
  lines: string[];
  depth: number;
}

export interface Geometry {
  theme?: Theme;
  width: number;
  height: number;
  bands: PlacedBand[];
  /** Empty header cell where lane and phase headers meet. */
  corner?: Box;
  containers: PlacedContainer[];
  nodes: PlacedNode[];
  edges: RoutedEdge[];
}
