import { pack } from '../pack.ts';
import { isDummy, type Chain, type Vertex } from './graph.ts';

export const NODE_GAP = 32;
export const EDGE_GAP = 12;

/** Cross-axis positions: neighbour-mean alignment, packed without overlap (URS-LY-002). Sets `pos`. */
export function place(layers: readonly number[][], verts: Vertex[], chains: readonly Chain[], sweeps = 6): void {
  const up: number[][] = verts.map(() => []);
  const down: number[][] = verts.map(() => []);
  for (const c of chains)
    c.verts.slice(1).forEach((b, i) => {
      down[c.verts[i]!]!.push(b);
      up[b]!.push(c.verts[i]!);
    });

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
