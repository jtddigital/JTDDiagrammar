import { pack } from '../pack.ts';
import { EDGE_GAP, LANE_PAD, NODE_GAP } from './constants.ts';
import { isDummy, type Chain, type Span, type Vertex } from './graph.ts';

/** Neighbour-mean alignment within one group, packed without overlap. Sets `pos`. */
function placeGroup(layers: readonly number[][], verts: Vertex[], up: number[][], down: number[][], sweeps: number): void {
  const seps = layers.map((l) =>
    l.map((v, i) => {
      if (!i) return 0;
      const a = verts[l[i - 1]!]!;
      const b = verts[v]!;
      return (a.cross + b.cross) / 2 + (isDummy(a) || isDummy(b) ? EDGE_GAP : NODE_GAP);
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
  for (const c of chains)
    c.verts.slice(1).forEach((b, i) => {
      const a = c.verts[i]!;
      if (!same(a, b)) return;
      down[a]!.push(b);
      up[b]!.push(a);
    });

  if (!laneMin) {
    placeGroup(layers, verts, up, down, sweeps);
    return [];
  }
  const bands: Span[] = [];
  let at = 0;
  laneMin.forEach((min, g) => {
    const sub = layers.map((l) => l.filter((v) => verts[v]!.group === g));
    placeGroup(sub, verts, up, down, sweeps);
    const vs = sub.flat().map((v) => verts[v]!);
    const lo = vs.length ? Math.min(...vs.map((v) => v.pos - v.cross / 2)) : 0;
    const hi = vs.length ? Math.max(...vs.map((v) => v.pos + v.cross / 2)) : 0;
    const size = Math.max(hi - lo + 2 * LANE_PAD, min);
    const shift = at + (size - (hi - lo)) / 2 - lo;
    for (const v of vs) v.pos += shift;
    bands.push({ start: at, end: at + size });
    at += size;
  });
  return bands;
}
