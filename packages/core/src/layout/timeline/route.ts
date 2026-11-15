import type { Box, Point } from '../../geometry.ts';
import type { Side } from '../../ir/types.ts';
import { corners } from '../tree/block.ts';

/** Clearance a line keeps from bars it passes. */
const CLEAR = 4;

export interface Rows {
  /** The drawn item in each row (undefined for an empty row). */
  boxes: (Box | undefined)[];
  top(row: number): number;
  bottom(row: number): number;
}

/**
 * A dependency line (URS-LY-015) from the `from` side of row `a`'s item to the `to` side of row `b`'s.
 * It leaves and enters horizontally, runs along the gaps between rows, and crosses the rows between
 * them only where no item is in the way, so it never passes through one.
 */
export function route(rows: Rows, a: number, from: Side, b: number, to: Side, port: (row: number, side: Side) => Point, ends: { exit: number; entry: number }): Point[] {
  const [p, q] = [port(a, from), port(b, to)];
  const x1 = p.x + (from === 'E' ? ends.exit : -ends.exit);
  const xe = q.x + (to === 'W' ? -ends.entry : ends.entry);
  const between = rows.boxes.slice(Math.min(a, b) + 1, Math.max(a, b)).filter((x): x is Box => !!x);
  const free = (x: number) => between.every((r) => x < r.x - CLEAR || x > r.x + r.w + CLEAR);
  // Straight down (or up) from the stub and along the target's row, when nothing is in the way.
  const reaches = to === 'W' ? x1 <= xe : x1 >= xe;
  if (free(x1) && reaches) return corners([p, { x: x1, y: p.y }, { x: x1, y: q.y }, q]);
  // Otherwise: along the gap beside row a, across at a free x, along the gap beside row b.
  const ga = b > a ? rows.bottom(a) : rows.top(a);
  const gb = b > a ? rows.top(b) : rows.bottom(b);
  const candidates = [xe, x1, ...between.flatMap((r) => [r.x - CLEAR - 2, r.x + r.w + CLEAR + 2])].sort((u, v) => Math.abs(u - xe) - Math.abs(v - xe));
  const x = candidates.find(free) ?? xe;
  return corners([p, { x: x1, y: p.y }, { x: x1, y: ga }, { x, y: ga }, { x, y: gb }, { x: xe, y: gb }, { x: xe, y: q.y }, q]);
}
