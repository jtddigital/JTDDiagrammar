/**
 * SVG path data as PDF path operators (URS-WS-046): every SVG command, relative or absolute, becomes moves,
 * lines and cubic curves; quadratic curves are raised to cubics and elliptical arcs split into cubic pieces.
 */
const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : String(Math.round(v * 1000) / 1000));

/** Cubic pieces approximating an SVG elliptical arc from (x1, y1) to (x2, y2), per the SVG implementation notes. */
function arc(x1: number, y1: number, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return x1 === x2 && y1 === y2 ? [] : [[x1, y1, x2, y2, x2, y2]];
  const phi = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const parts = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const step = dt / parts;
  const h = (4 / 3) * Math.tan(step / 4);
  const at = (t: number) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const tangent = (t: number) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: number[][] = [];
  for (let i = 0; i < parts; i++) {
    const [a, b] = [t1 + i * step, t1 + (i + 1) * step];
    const [p0, p3, d0, d3] = [at(a), at(b), tangent(a), tangent(b)];
    out.push([p0[0]! + h * d0[0]!, p0[1]! + h * d0[1]!, p3[0]! - h * d3[0]!, p3[1]! - h * d3[1]!, p3[0]!, p3[1]!]);
  }
  return out;
}

/** The path's segments: where it starts, and each segment's end point and direction there (for arrowheads). */
export interface PathInfo {
  ops: string;
  /** Last point and the direction the path arrives in, in radians. */
  end?: { x: number; y: number; angle: number };
  start?: { x: number; y: number; angle: number };
}

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

export function svgPath(d: string): PathInfo {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let prev = '';
  let [cx2, cy2] = [0, 0];
  let [qx, qy] = [0, 0];
  let start: PathInfo['start'];
  let end: PathInfo['end'];
  const angle = (fx: number, fy: number, tx: number, ty: number) => Math.atan2(ty - fy, tx - fx);
  const line = (tx: number, ty: number) => {
    if (!start) start = { x, y, angle: angle(x, y, tx, ty) };
    out.push(`${n(tx)} ${n(ty)} l`);
    if (tx !== x || ty !== y) end = { x: tx, y: ty, angle: angle(x, y, tx, ty) };
    [x, y] = [tx, ty];
  };
  const curve = (a: number, b: number, c: number, e: number, tx: number, ty: number) => {
    if (!start) start = { x, y, angle: a === x && b === y ? angle(x, y, c, e) : angle(x, y, a, b) };
    out.push(`${n(a)} ${n(b)} ${n(c)} ${n(e)} ${n(tx)} ${n(ty)} c`);
    end = { x: tx, y: ty, angle: c === tx && e === ty ? angle(a, b, tx, ty) : angle(c, e, tx, ty) };
    [cx2, cy2, x, y] = [c, e, tx, ty];
  };
  let i = 0;
  let cmd = '';
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) break;
    const lower = cmd.toLowerCase();
    const rel = cmd === lower;
    const count = ARGS[lower];
    if (count === undefined) break;
    const a = tokens.slice(i, i + count).map(Number);
    if (a.length < count || a.some(Number.isNaN)) break;
    i += count;
    const [ox, oy] = rel ? [x, y] : [0, 0];
    switch (lower) {
      case 'm':
        [x, y] = [a[0]! + ox, a[1]! + oy];
        [sx, sy] = [x, y];
        out.push(`${n(x)} ${n(y)} m`);
        // Further pairs after a move are lines.
        cmd = rel ? 'l' : 'L';
        break;
      case 'l':
        line(a[0]! + ox, a[1]! + oy);
        break;
      case 'h':
        line(a[0]! + ox, y);
        break;
      case 'v':
        line(x, a[0]! + (rel ? y : 0));
        break;
      case 'c':
        curve(a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy, a[4]! + ox, a[5]! + oy);
        break;
      case 's': {
        const [rx1, ry1] = /[cs]/i.test(prev) ? [2 * x - cx2, 2 * y - cy2] : [x, y];
        curve(rx1, ry1, a[0]! + ox, a[1]! + oy, a[2]! + ox, a[3]! + oy);
        break;
      }
      case 'q':
      case 't': {
        const [px, py] = lower === 'q' ? [a[0]! + ox, a[1]! + oy] : /[qt]/i.test(prev) ? [2 * x - qx, 2 * y - qy] : [x, y];
        const [tx, ty] = lower === 'q' ? [a[2]! + ox, a[3]! + oy] : [a[0]! + ox, a[1]! + oy];
        [qx, qy] = [px, py];
        curve(x + (2 / 3) * (px - x), y + (2 / 3) * (py - y), tx + (2 / 3) * (px - tx), ty + (2 / 3) * (py - ty), tx, ty);
        break;
      }
      case 'a':
        for (const [c1x, c1y, c2x, c2y, tx, ty] of arc(x, y, a[0]!, a[1]!, a[2]!, a[3] !== 0, a[4] !== 0, a[5]! + ox, a[6]! + oy)) curve(c1x!, c1y!, c2x!, c2y!, tx!, ty!);
        break;
      case 'z':
        out.push('h');
        if (x !== sx || y !== sy) end = { x: sx, y: sy, angle: angle(x, y, sx, sy) };
        [x, y] = [sx, sy];
        break;
    }
    prev = cmd;
    if (lower === 'z') cmd = '';
  }
  return { ops: out.join('\n'), ...(start && { start }), ...(end && { end }) };
}
