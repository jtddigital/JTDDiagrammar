import type { Chain, Vertex } from './graph.ts';

const segments = (chains: readonly Chain[]) => chains.flatMap((c) => c.verts.slice(1).map((b, i) => [c.verts[i]!, b] as const));

/** Edge crossings between adjacent layers, given each vertex's index within its layer. */
function crossings(layers: readonly number[][], idx: readonly number[], segs: readonly (readonly [number, number])[], layerOf: (v: number) => number): number {
  const byGap: [number, number][][] = layers.map(() => []);
  for (const [a, b] of segs) byGap[layerOf(a)]!.push([idx[a]!, idx[b]!]);
  let count = 0;
  for (const g of byGap)
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) if ((g[i]![0] - g[j]![0]) * (g[i]![1] - g[j]![1]) < 0) count++;
  return count;
}

/** Barycenter crossing reduction; keeps the best ordering seen (URS-LY-007). Mutates `layers`. */
export function order(layers: number[][], verts: readonly Vertex[], chains: readonly Chain[], sweeps = 8): void {
  const segs = segments(chains);
  const up: number[][] = verts.map(() => []);
  const down: number[][] = verts.map(() => []);
  for (const [a, b] of segs) {
    down[a]!.push(b);
    up[b]!.push(a);
  }
  const idx = new Array<number>(verts.length).fill(0);
  const index = () => layers.forEach((l) => l.forEach((v, i) => (idx[v] = i)));
  const layerOf = (v: number) => verts[v]!.layer;

  index();
  let best = { score: crossings(layers, idx, segs, layerOf), layers: layers.map((l) => [...l]) };
  for (let s = 0; s < sweeps && best.score > 0; s++) {
    const isDown = s % 2 === 0;
    const range = isDown ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1);
    for (const li of range) {
      const nbrs = isDown ? up : down;
      const bary = (v: number) => (nbrs[v]!.length ? nbrs[v]!.reduce((s, u) => s + idx[u]!, 0) / nbrs[v]!.length : idx[v]!);
      const keyed = layers[li]!.map((v) => [bary(v), v] as const);
      layers[li] = keyed.sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      layers[li]!.forEach((v, i) => (idx[v] = i));
    }
    const score = crossings(layers, idx, segs, layerOf);
    if (score < best.score) best = { score, layers: layers.map((l) => [...l]) };
  }
  best.layers.forEach((l, i) => (layers[i] = l));
}
