import { min, max } from '../../math.ts';
import { pack } from '../pack.ts';
import { EDGE_GAP, LANE_PAD, NODE_GAP } from './constants.ts';
import { isDummy, type Chain, type Span, type Vertex } from './graph.ts';

/**
 * Move blocks of vertices already in line onto a neighbour's line where that straightens more edges
 * than it bends, within the room each member's layer leaves (URS-LY-013). `straight[v]` lists the
 * neighbours an edge from `v` would run straight to when both are centred on one line.
 */
function straighten(layers: readonly number[][], verts: Vertex[], seps: readonly number[][], straight: readonly number[][]): void {
  const where = new Map<number, [number, number]>();
  layers.forEach((l, li) => l.forEach((v, i) => where.set(v, [li, i])));
  const pos = (v: number) => verts[v]!.pos;
  const lined = (a: number, b: number) => Math.abs(pos(a) - pos(b)) < 0.5;
  const room = (v: number): [number, number] => {
    const [li, i] = where.get(v)!;
    const l = layers[li]!;
    return [i ? pos(l[i - 1]!) + seps[li]![i]! : -Infinity, i < l.length - 1 ? pos(l[i + 1]!) - seps[li]![i + 1]! : Infinity];
  };
  for (let round = 0, moved = true; moved && round < 8; round++) {
    moved = false;
    const seen = new Set<number>();
    for (const start of where.keys()) {
      if (seen.has(start)) continue;
      // The block: everything reachable through straight edges that are already straight.
      const block = [start];
      seen.add(start);
      for (let k = 0; k < block.length; k++)
        for (const u of straight[block[k]!]!)
          if (!seen.has(u) && lined(block[k]!, u)) {
            seen.add(u);
            block.push(u);
          }
      const inside = new Set(block);
      const out = block.flatMap((v) => straight[v]!.filter((u) => !inside.has(u)).map((u) => [v, u] as const));
      const gain = (d: number) => out.filter(([v, u]) => Math.abs(pos(v) + d - pos(u)) < 0.5).length - out.filter(([v, u]) => lined(v, u)).length;
      let [best, most] = [0, 0];
      for (const [v, u] of out) {
        const d = pos(u) - pos(v);
        const g = gain(d);
        if (g > most && block.every((w) => (([lo, hi]) => pos(w) + d >= lo - 0.01 && pos(w) + d <= hi + 0.01)(room(w)))) [best, most] = [d, g];
      }
      if (most > 0) {
        for (const w of block) verts[w]!.pos += best;
        moved = true;
      }
    }
  }
}

/** Neighbour-mean alignment within one group, packed without overlap, then straightened. Sets `pos`. */
function placeGroup(layers: readonly number[][], verts: Vertex[], up: number[][], down: number[][], straight: readonly number[][], sweeps: number): void {
  const seps = layers.map((l) =>
    l.map((v, i) => {
      if (!i) return 0;
      const a = verts[l[i - 1]!]!;
      const b = verts[v]!;
      return (a.cross + b.cross) / 2 + (a.after ?? 0) + (isDummy(a) || isDummy(b) ? EDGE_GAP : NODE_GAP);
    }),
  );
  const packLayer = (li: number, want: (v: number) => number) => {
    const l = layers[li]!;
    pack(l.map(want), seps[li]!).forEach((p, i) => (verts[l[i]!]!.pos = p));
  };
  const mean = (vs: number[], fallback: number) => (vs.length ? vs.reduce((s, v) => s + verts[v]!.pos, 0) / vs.length : fallback);

  layers.forEach((_, li) => packLayer(li, () => 0));
  for (let s = 0; s < sweeps; s++) {
    const isDown = s % 2 === 0;
    const range = isDown ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1);
    for (const li of range) packLayer(li, (v) => mean((isDown ? up : down)[v]!, verts[v]!.pos));
  }
  layers.forEach((_, li) => packLayer(li, (v) => mean([...up[v]!, ...down[v]!], verts[v]!.pos)));
  straighten(layers, verts, seps, straight);
}

/**
 * Cross-axis positions (URS-LY-002). Unpartitioned: one free group.
 * Partitioned: each lane is placed on its own, then lanes are stacked as bands of at least
 * `laneMin[g]`, content centred (URS-LY-003). Returns each lane's band.
 */
export function place(layers: readonly number[][], verts: Vertex[], chains: readonly Chain[], laneMin?: readonly number[], sweeps = 6): Span[] {
  const same = (a: number, b: number) => verts[a]!.group === verts[b]!.group;
  const up: number[][] = verts.map(() => []);
  const down: number[][] = verts.map(() => []);
  const [outs, ins] = [verts.map(() => 0), verts.map(() => 0)];
  for (const c of chains)
    c.verts.slice(1).forEach((b, i) => {
      const a = c.verts[i]!;
      outs[a]!++;
      ins[b]!++;
      if (!same(a, b)) return;
      down[a]!.push(b);
      up[b]!.push(a);
    });
  // A centred edge is straight when it has its side of each node to itself (or attaches at a tip).
  const straight: number[][] = verts.map(() => []);
  verts.forEach((_, a) =>
    down[a]!.forEach((b) => {
      if (!(verts[a]!.tips || outs[a] === 1) || !(verts[b]!.tips || ins[b] === 1)) return;
      straight[a]!.push(b);
      straight[b]!.push(a);
    }),
  );

  if (!laneMin) {
    placeGroup(layers, verts, up, down, straight, sweeps);
    return [];
  }
  const bands: Span[] = [];
  let at = 0;
  laneMin.forEach((minSize, g) => {
    const sub = layers.map((l) => l.filter((v) => verts[v]!.group === g));
    placeGroup(sub, verts, up, down, straight, sweeps);
    const vs = sub.flat().map((v) => verts[v]!);
    const lo = min(vs.map((v) => v.pos - v.cross / 2));
    const hi = max(vs.map((v) => v.pos + v.cross / 2 + (v.after ?? 0)));
    const size = Math.max(hi - lo + 2 * LANE_PAD, minSize);
    const shift = at + (size - (hi - lo)) / 2 - lo;
    for (const v of vs) v.pos += shift;
    bands.push({ start: at, end: at + size });
    at += size;
  });
  return bands;
}
