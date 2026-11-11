import type { Point } from '../geometry.ts';

export type Side = 'N' | 'E' | 'S' | 'W';

export const PAD_X = 12;
export const PAD_Y = 8;
export const MIN_W = 96;
export const MIN_H = 40;

/** A node shape. All coordinates are local: (0,0) is the top-left of the w × h box. */
export interface Shape {
  id: string;
  /** Box size that fits a text block of tw × th. */
  size(tw: number, th: number): { w: number; h: number };
  /** Filled outline (SVG path data). */
  outline(w: number, h: number): string;
  /** Stroke-only extras, e.g. subprocess bars. */
  detail?(w: number, h: number): string;
  /** Filled with the stroke colour, e.g. the dot of an initial state. */
  solid?(w: number, h: number): string;
  /** The shape draws no label (pseudostates). */
  unlabelled?: boolean;
  /** Edges attach only at the four side midpoints (diamonds); the router allocates them jointly. */
  tips?: boolean;
  /** Vertical offset of the label centre from the box centre. */
  labelDy?(w: number, h: number): number;
  /** Boundary point on a side; t ∈ [-1, 1] spreads multiple edges along the side where the shape allows. */
  port(side: Side, w: number, h: number, t: number): Point;
}

/** Ports for box-like shapes: spread along the middle 60 % of each side. */
export const boxPort =
  (inset: (side: Side, w: number, h: number) => number = () => 0) =>
  (side: Side, w: number, h: number, t: number): Point => {
    const i = inset(side, w, h);
    switch (side) {
      case 'N':
        return { x: w / 2 + t * w * 0.3, y: 0 };
      case 'S':
        return { x: w / 2 + t * w * 0.3, y: h - i };
      case 'W':
        return { x: i, y: h / 2 + t * h * 0.3 };
      case 'E':
        return { x: w - i, y: h / 2 + t * h * 0.3 };
    }
  };

/** Point on a circle of radius r centred at (cx, cy), spread along `side` by t ∈ [-1, 1]. */
export const circlePort = (cx: number, cy: number, r: number, side: Side, t: number): Point => {
  const d = t * r * 0.6;
  const out = Math.sqrt(r * r - d * d);
  return { N: { x: cx + d, y: cy - out }, S: { x: cx + d, y: cy + out }, W: { x: cx - out, y: cy + d }, E: { x: cx + out, y: cy + d } }[side];
};

/** Ports fixed at side midpoints (diamond vertices, circle). */
export const midPort = (side: Side, w: number, h: number): Point =>
  ({ N: { x: w / 2, y: 0 }, S: { x: w / 2, y: h }, W: { x: 0, y: h / 2 }, E: { x: w, y: h / 2 } })[side];

export const boxSize = (extraW = 0, extraH = 0) => (tw: number, th: number) => ({
  w: Math.max(MIN_W, tw + 2 * PAD_X + extraW),
  h: Math.max(MIN_H, th + 2 * PAD_Y) + extraH,
});
