import type { Point } from '../geometry.ts';
import type { Direction } from '../ir/types.ts';
import type { Side } from '../shapes/shape.ts';

/**
 * Direction-agnostic coordinates: `m` runs along the flow, `c` across it.
 * Engines work in (m, c) and convert at the end (URS-DM-003).
 */
export interface Flow {
  mainStart: Side;
  mainEnd: Side;
  crossStart: Side;
  crossEnd: Side;
  /** Size of a w × h box along each axis. */
  main(w: number, h: number): number;
  cross(w: number, h: number): number;
  /** Local (x, y) offset → (m, c) offset. */
  local(p: Point): { m: number; c: number };
  toXY(m: number, c: number): Point;
}

const LR: Flow = {
  mainStart: 'W',
  mainEnd: 'E',
  crossStart: 'N',
  crossEnd: 'S',
  main: (w) => w,
  cross: (_w, h) => h,
  local: (p) => ({ m: p.x, c: p.y }),
  toXY: (m, c) => ({ x: m, y: c }),
};

const TB: Flow = {
  mainStart: 'N',
  mainEnd: 'S',
  crossStart: 'W',
  crossEnd: 'E',
  main: (_w, h) => h,
  cross: (w) => w,
  local: (p) => ({ m: p.y, c: p.x }),
  toXY: (m, c) => ({ x: c, y: m }),
};

export const flowOf = (d: Direction): Flow => (d === 'TB' ? TB : LR);
