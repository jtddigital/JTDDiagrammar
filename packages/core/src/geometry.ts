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
  shape: string;
  lines: string[];
}

export interface RoutedEdge {
  id: string;
  from: string;
  to: string;
  points: Point[];
  label?: Box & { lines: string[] };
}

/** A lane or phase: the full band area plus its header cell (URS-DM-001/002). */
export interface PlacedBand extends Box {
  id: string;
  kind: 'lane' | 'phase';
  lines: string[];
  header: Box;
}

export interface Geometry {
  width: number;
  height: number;
  bands: PlacedBand[];
  /** Empty header cell where lane and phase headers meet. */
  corner?: Box;
  nodes: PlacedNode[];
  edges: RoutedEdge[];
}
