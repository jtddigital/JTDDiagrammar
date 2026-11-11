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

export interface Geometry {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: RoutedEdge[];
}
