import type { Point } from '../geometry.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Drop repeated points and interior points of straight runs. */
export function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const a = out.at(-1);
    if (a && near(a.x, p.x) && near(a.y, p.y)) continue;
    const b = out.at(-2);
    if (a && b && ((near(b.x, a.x) && near(a.x, p.x)) || (near(b.y, a.y) && near(a.y, p.y)))) out.pop();
    out.push(p);
  }
  return out;
}
