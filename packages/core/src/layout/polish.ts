import type { Box, Geometry, PlacedNode, Point, RoutedEdge } from '../geometry.ts';
import type { IREdge, Side } from '../ir/types.ts';
import { shape } from '../shapes/library.ts';
import { entryStub, EXIT_STUB } from '../style.ts';
import { Grid } from './grid.ts';
import { along } from './labels.ts';
import { cross, hits } from './metrics.ts';
import { obstacles } from './obstacles.ts';

type Content = Omit<Geometry, 'width' | 'height'>;
type Seg = [Point, Point];
type Ports = NonNullable<IREdge['ports']>;

const DIR: Record<Side, Point> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, E: { x: 1, y: 0 } };
const SIDES: Side[] = ['E', 'S', 'W', 'N'];
const OPPOSITE: Record<Side, Side> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const across = (s: Side): Side[] => (s === 'N' || s === 'S' ? ['E', 'W'] : ['N', 'S']);
const flat = (s: Side) => s === 'N' || s === 'S';
const SPREAD = [0, -0.5, 0.5, -1, 1];
/**
 * Search effort: bend classes tried (fewer than this many bends) and ports sampled per side. Large
 * graphs search less, so a 200-node layout stays well inside URS-LY-010's budget; ordinary diagrams
 * get the full search.
 */
const FULL = { classes: 4, spread: SPREAD.length };
const CHEAP = { classes: 3, spread: 3 };
const LARGE = 150;
/** Lines closer than this read as one. */
const NEAR = 4;
/** Ends of different edges on one node keep this far apart. */
const PORT_GAP = 8;

const segBox = ([a, b]: Seg): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
const segsOf = (pts: readonly Point[]): Seg[] => pts.slice(1).map((p, i) => [pts[i]!, p]);
const dot = (a: Point, b: Point, d: Point) => (b.x - a.x) * d.x + (b.y - a.y) * d.y;
const tangent = (p: Point, s: Side) => (flat(s) ? p.x : p.y);

/** Port of a placed node on a side, in diagram coordinates. */
const port = (n: PlacedNode, s: Side, t: number): Point => {
  const p = shape(n.shape).port(s, n.w, n.h, t);
  return { x: n.x + p.x, y: n.y + p.y };
};
/** Candidate ports on a side: the middle first. Shapes with tips have one per side. */
const ports = (n: PlacedNode, s: Side) => (shape(n.shape).tips ? [port(n, s, 0)] : SPREAD.map((t) => port(n, s, t)));
/** The port on a side whose position along the side is `v`, if the side offers one there. Ports move monotonically with t. */
function portAt(n: PlacedNode, s: Side, v: number): Point | undefined {
  if (shape(n.shape).tips) {
    const p = port(n, s, 0);
    return Math.abs(tangent(p, s) - v) < 0.5 ? p : undefined;
  }
  let [lo, hi] = [-1, 1];
  if (v < tangent(port(n, s, lo), s) - 0.01 || v > tangent(port(n, s, hi), s) + 0.01) return undefined;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (tangent(port(n, s, mid), s) < v) lo = mid;
    else hi = mid;
  }
  const p = port(n, s, (lo + hi) / 2);
  return Math.abs(tangent(p, s) - v) < 0.5 ? { ...p, ...(flat(s) ? { x: v } : { y: v }) } : undefined;
}

const sign = (s: Side) => DIR[s].x + DIR[s].y;
/** Coordinate along the axis `s` points in. */
const coord = (p: Point, s: Side) => (flat(s) ? p.y : p.x);
/** `p` moved along the axis of `s` to coordinate v. */
const withC = (p: Point, s: Side, v: number): Point => (flat(s) ? { x: p.x, y: v } : { x: v, y: p.y });
/** Every leg non-empty and each turn a right angle. */
function orthogonal(pts: readonly Point[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1]!, pts[i]!];
    if ((p.x === q.x) === (p.y === q.y) || (i > 1 && (pts[i - 2]!.x === p.x) === (p.x === q.x))) return false;
  }
  return true;
}
/** Manhattan length of a route. */
const lengthOf = (pts: readonly Point[]) => pts.reduce((m, p, i) => (i ? m + Math.abs(p.x - pts[i - 1]!.x) + Math.abs(p.y - pts[i - 1]!.y) : 0), 0);
interface Candidate {
  pts: Point[];
  from: Side;
  to: Side;
  len: number;
}
/** Channel offsets tried beyond the shortest legs. */
const FURTHER = [0, 16, 40];

/**
 * Routes from `a` to `b` with exactly `k` bends: straight, one (L), two (Z between facing sides, U round
 * the same side) or three. Each leaves and enters perpendicular to its sides with legs of at least the
 * exit stub and `entry`.
 */
function candidates(a: PlacedNode, b: PlacedNode, hint: Ports | undefined, entry: number, k: number, spread: number): Candidate[] {
  const out: Candidate[] = [];
  // Shapes lying across the flow (bars) take edges on their long sides only.
  const long = (n: PlacedNode, sd: Side) => !shape(n.shape).across || (flat(sd) ? n.w >= n.h : n.h >= n.w);
  const ok = (sa: Side, sb: Side) => (!hint?.from || hint.from === sa) && (!hint?.to || hint.to === sb) && long(a, sa) && long(b, sb);
  const add = (pts: Point[], from: Side, to: Side) => orthogonal(pts) && out.push({ pts, from, to, len: lengthOf(pts) });
  if (k === 0)
    for (const sa of SIDES) {
      const sb = OPPOSITE[sa];
      if (!ok(sa, sb)) continue;
      const [la, ha, lb, hb] = [...[-1, 1].map((t) => tangent(port(a, sa, t), sa)), ...[-1, 1].map((t) => tangent(port(b, sb, t), sb))] as [number, number, number, number];
      const [lo, hi] = [Math.max(la, lb), Math.min(ha, hb)];
      if (lo > hi + 0.01) continue;
      const mid = (v: number) => Math.min(hi, Math.max(lo, v));
      for (const v of new Set([mid(tangent(port(a, sa, 0), sa)), mid(tangent(port(b, sb, 0), sb)), (lo + hi) / 2])) {
        const [p, q] = [portAt(a, sa, v), portAt(b, sb, v)];
        if (p && q && dot(p, q, DIR[sa]) >= Math.max(EXIT_STUB, entry)) add([p, q], sa, sb);
      }
    }
  if (k === 1)
    for (const sa of SIDES)
      for (const sb of across(sa)) {
        if (!ok(sa, sb)) continue;
        const qs = ports(b, sb).slice(0, spread);
        for (const p of ports(a, sa).slice(0, spread))
          for (const q of qs) {
            const corner = flat(sa) ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
            if (dot(p, corner, DIR[sa]) >= EXIT_STUB && dot(q, corner, DIR[sb]) >= entry) add([p, corner, q], sa, sb);
          }
      }
  if (k >= 2)
    for (const sa of SIDES)
      for (const sb of SIDES) {
        if (!ok(sa, sb) || (k === 3) !== across(sa).includes(sb)) continue;
        const [p, q] = [port(a, sa, 0), port(b, sb, 0)];
        const [pc, qc] = [coord(p, sa) + sign(sa) * EXIT_STUB, coord(q, sb) + sign(sb) * entry];
        if (k === 2) {
          // Z: a channel between facing sides; U: one beyond both, round the same side.
          const ms = sb === sa ? FURTHER.map((d) => (sign(sa) > 0 ? Math.max(pc, qc) : Math.min(pc, qc)) + sign(sa) * d) : (qc - pc) * sign(sa) >= 0 ? [(pc + qc) / 2, pc, qc] : [];
          for (const m of ms) add([p, withC(p, sa, m), withC(q, sa, m), q], sa, sb);
        } else
          // Three bends: out of `a`, across, back along, into `b`.
          for (const d of FURTHER)
            for (const e of FURTHER) {
              const p1 = withC(p, sa, pc + sign(sa) * d);
              const c2 = qc + sign(sb) * e;
              add([p, p1, withC(p1, sb, c2), withC(q, sb, c2), q], sa, sb);
            }
      }
  return out;
}

/** The side a route leaves its first node by, and enters its last node by. */
const exitSide = ([a, b]: readonly Point[]): Side => (a!.y === b!.y ? (b!.x > a!.x ? 'E' : 'W') : b!.y > a!.y ? 'S' : 'N');
const entrySide = (pts: readonly Point[]): Side => OPPOSITE[exitSide([pts.at(-2)!, pts.at(-1)!])];

/** Same orientation and closer than NEAR along more than NEAR px: one line on top of (or hugging) the other. */
function near([a, b]: Seg, [c, d]: Seg): boolean {
  const h = a.y === b.y;
  if (h !== (c.y === d.y) || (h ? a.x === b.x : a.y === b.y) || (h ? c.x === d.x : c.y === d.y)) return false;
  const [k1, k2] = h ? [a.y, c.y] : [a.x, c.x];
  const [a0, a1, b0, b1] = h ? [a.x, b.x, c.x, d.x] : [a.y, b.y, c.y, d.y];
  return Math.abs(k1 - k2) < NEAR && Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)) > NEAR;
}


/** Lexicographic comparison. */
const less = (x: readonly number[], y: readonly number[]) => {
  const i = x.findIndex((v, k) => v !== y[k]);
  return i >= 0 && x[i]! < y[i]!;
};

const strictlyIn = (p: Point, r: Box) => p.x > r.x + 0.5 && p.x < r.x + r.w - 0.5 && p.y > r.y + 0.5 && p.y < r.y + r.h - 0.5;
const contains = (r: Box, b: Box) => b.x >= r.x - 0.5 && b.y >= r.y - 0.5 && b.x + b.w <= r.x + r.w + 0.5 && b.y + b.h <= r.y + r.h + 0.5;
const crossesBorder = ([p, q]: Seg, r: Box) => strictlyIn(p, r) !== strictlyIn(q, r) || (!strictlyIn(p, r) && hits([p, q], r));

/**
 * Bend reduction (URS-LY-013), independent of the layout engine. Each edge in turn takes a straight
 * or one-bend route instead of the router's when that has fewer bends and stays clean: it leaves and
 * enters perpendicular to the sides it uses, with the last leg long enough to show the line past the
 * arrowhead; it uses a free port, honours side hints, keeps off nodes, headers and callouts and off
 * other edges' lines, crosses no container border it need not, and crosses no more edges than before.
 * Among clean routes the fewest bends win, then the fewest crossings, then the one keeping the
 * router's exit and entry sides, then the shortest.
 */
export function polish(g: Content, irEdges: readonly IREdge[]): Content {
  // Side hints and arrowhead sizes come from the IR: layout output carries no styles yet.
  const info = new Map(irEdges.map((e) => [e.id, e]));
  const effort = g.edges.length > LARGE ? CHEAP : FULL;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const obs = new Grid<Box & { id: string }>();
  for (const o of obstacles(g)) obs.add(o, o);
  for (const n of g.nodes) if (n.callout) obs.add(n.callout, { id: `${n.id}#callout`, ...n.callout });
  const edges = g.edges.map((e) => ({ ...e }));
  const lines = new Grid<{ edge: number; seg: Seg }>();
  const live = edges.map((e) => new Set(segsOf(e.points)));
  live.forEach((ss, edge) => ss.forEach((seg) => lines.add(segBox(seg), { edge, seg })));
  const others = (edge: number, s: Seg) => [...lines.near(segBox(s))].filter((l) => l.edge !== edge && live[l.edge]!.has(l.seg));
  const crossings = (edge: number, ss: readonly Seg[]) => ss.reduce((n, s) => n + others(edge, s).filter((l) => cross(s, l.seg)).length, 0);
  // Edges ending at each node, for the free-port check; points are read when needed, as edges change.
  const atNode = new Map<string, { edge: number; end: 'from' | 'to' }[]>();
  edges.forEach((e, edge) => (['from', 'to'] as const).forEach((end) => atNode.set(e[end], [...(atNode.get(e[end]) ?? []), { edge, end }])));
  const endsAt = (node: string, edge: number) =>
    (atNode.get(node) ?? []).filter((x) => x.edge !== edge).map((x) => (x.end === 'from' ? edges[x.edge]!.points[0]! : edges[x.edge]!.points.at(-1)!));

  edges.forEach((e, edge) => {
    const [a, b] = [byId.get(e.from), byId.get(e.to)];
    const bends = e.points.length - 2;
    if (!a || !b || a === b || bends < 1) return;
    const entry = entryStub(info.get(e.id)?.style, info.get(e.id)?.marker);
    const [taken, sides] = [[...endsAt(a.id, edge), ...endsAt(b.id, edge)], [exitSide(e.points), entrySide(e.points)]];
    const walls = g.containers.filter((c) => contains(c, a) === contains(c, b));
    // Counted only once a candidate is clean enough to compare.
    let before: number | undefined;
    let best: { pts: Point[]; key: number[] } | undefined;
    // Candidates share legs: look each leg up once, and other edges only for legs that are clear.
    const blockedMemo = new Map<string, boolean>();
    const linesMemo = new Map<string, { edge: number; seg: Seg }[]>();
    const keyOf = (s: Seg) => `${s[0].x},${s[0].y},${s[1].x},${s[1].y}`;
    /** A leg runs into a node, header, callout or container border, or on top of another edge. */
    const blocked = (s: Seg, own: 'a' | 'b' | '') => {
      const k = keyOf(s) + own;
      let v = blockedMemo.get(k);
      if (v === undefined) {
        v =
          walls.some((w) => crossesBorder(s, w)) ||
          obs.some(segBox(s), (o) => !((o.id === a.id && own === 'a') || (o.id === b.id && own === 'b')) && hits(s, o)) ||
          lines.some(segBox(s), (l) => l.edge !== edge && near(s, l.seg) && live[l.edge]!.has(l.seg));
        blockedMemo.set(k, v);
      }
      return v;
    };
    const linesNear = (s: Seg) => {
      const k = keyOf(s);
      let v = linesMemo.get(k);
      if (!v) linesMemo.set(k, (v = others(edge, s)));
      return v;
    };
    const turned = (c: Candidate) => Number(c.from !== sides[0]) + Number(c.to !== sides[1]);
    // In the order of the ranking below without crossings, so the first clean route without any wins outright.
    // One bend count at a time, fewest first: a class with a clean route ends the search.
    const ranked = function* () {
      for (let k = 0; k < Math.min(bends, effort.classes) && !best; k++) yield* candidates(a, b, info.get(e.id)?.ports, entry, k, effort.spread).sort((x, y) => turned(x) - turned(y) || x.len - y.len);
    };
    for (const c of ranked()) {
      if (best && (c.pts.length > best.pts.length || best.key[1] === 0)) break;
      const ss = segsOf(c.pts);
      if (![c.pts[0]!, c.pts.at(-1)!].every((p) => taken.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= PORT_GAP))) continue;
      // The first leg starts on its own node and the last ends on its: only other legs must keep off them.
      if (ss.some((s, i) => blocked(s, i === 0 ? 'a' : i === ss.length - 1 ? 'b' : ''))) continue;
      const nearby = ss.map(linesNear);
      const n = ss.reduce((m, s, i) => m + nearby[i]!.filter((l) => cross(s, l.seg)).length, 0);
      if (n > (before ??= crossings(edge, segsOf(e.points)))) continue;
      const key = [c.pts.length, n, turned(c), c.len];
      if (!best || less(key, best.key)) best = { pts: c.pts, key };
    }
    if (!best) return;
    live[edge] = new Set(segsOf(best.pts));
    live[edge]!.forEach((seg) => lines.add(segBox(seg), { edge, seg }));
    const mid = along(best.pts, 50);
    edges[edge] = { ...e, points: best.pts, ...(e.labels && { labels: e.labels.map((l) => (l.at === undefined ? { ...l, x: mid.x - l.w / 2, y: mid.y - l.h / 2 } : l)) }) };
  });
  return { ...g, edges: edges as RoutedEdge[] };
}
