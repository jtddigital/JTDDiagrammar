import type { Chain, Vertex } from './graph.ts';

const segments = (chains: readonly Chain[]) => chains.flatMap((c) => c.verts.slice(1).map((b, i) => [c.verts[i]!, b] as const));

/** Inversions in `b` after sorting by (a, b): the crossings between two layers. O(n log n) (Fenwick tree). */
export function inversions(pairs: [number, number][]): number {
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const size = pairs.reduce((m, p) => Math.max(m, p[1]), 0) + 2;
  const tree = new Array<number>(size + 1).fill(0);
  let count = 0;
  pairs.forEach(([, b], seen) => {
    let le = 0; // how many earlier b's are <= b
    for (let i = b + 1; i > 0; i -= i & -i) le += tree[i]!;
    count += seen - le;
    for (let i = b + 1; i <= size; i += i & -i) tree[i]!++;
  });
  return count;
}

function crossings(layers: readonly number[][], idx: readonly number[], segs: readonly (readonly [number, number])[], verts: readonly Vertex[]): number {
  const byGap: [number, number][][] = layers.map(() => []);
  for (const [a, b] of segs) byGap[verts[a]!.layer]!.push([idx[a]!, idx[b]!]);
  return byGap.reduce((n, g) => n + inversions(g), 0);
}

/** Hinted vertices keep their hinted relative order within their lane (URS-DM-008); others keep their places. */
function applyHints(layer: number[], verts: readonly Vertex[]): void {
  const slots = layer.map((v, i) => [v, i] as const).filter(([v]) => verts[v]!.hint !== undefined);
  const groups = new Map<number, (readonly [number, number])[]>();
  for (const s of slots) groups.set(verts[s[0]]!.group, [...(groups.get(verts[s[0]]!.group) ?? []), s]);
  for (const g of groups.values()) {
    const sorted = g.map(([v]) => v).sort((a, b) => verts[a]!.hint! - verts[b]!.hint!);
    g.forEach(([, pos], k) => (layer[pos] = sorted[k]!));
  }
}

/**
 * Crossing reduction (URS-LY-007): barycenter sweeps, then adjacent transpositions, keeping the best
 * ordering seen. Vertices stay grouped by lane in lane order (URS-DM-001); order hints are honoured
 * (URS-DM-008). Mutates `layers`.
 */
export function order(layers: number[][], verts: readonly Vertex[], chains: readonly Chain[], sweeps = 8): void {
  const segs = segments(chains);
  const up: number[][] = verts.map(() => []);
  const down: number[][] = verts.map(() => []);
  for (const [a, b] of segs) {
    down[a]!.push(b);
    up[b]!.push(a);
  }
  const idx = new Array<number>(verts.length).fill(0);
  const reindex = (li: number) => layers[li]!.forEach((v, i) => (idx[v] = i));
  const sortLayer = (li: number, key: (v: number) => number) => {
    layers[li] = layers[li]!.map((v) => [verts[v]!.group, key(v), v] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      .map(([, , v]) => v);
    applyHints(layers[li]!, verts);
    reindex(li);
  };
  const score = () => crossings(layers, idx, segs, verts);
  const snapshot = () => ({ score: score(), layers: layers.map((l) => [...l]) });

  layers.forEach((_, li) => reindex(li));
  layers.forEach((_, li) => sortLayer(li, (v) => idx[v]!));
  let best = snapshot();
  for (let s = 0; s < sweeps && best.score > 0; s++) {
    const isDown = s % 2 === 0;
    const nbrs = isDown ? up : down;
    const range = isDown ? [...layers.keys()].slice(1) : [...layers.keys()].reverse().slice(1);
    for (const li of range) sortLayer(li, (v) => (nbrs[v]!.length ? nbrs[v]!.reduce((sum, u) => sum + idx[u]!, 0) / nbrs[v]!.length : idx[v]!));
    const now = snapshot();
    if (now.score < best.score) best = now;
  }
  best.layers.forEach((l, i) => {
    layers[i] = l;
    reindex(i);
  });
  if (best.score > 0) transpose(layers, verts, up, down, idx);
}

/** Crossings among the edges of `a` and `b` (a placed before b) with one neighbouring layer. */
const pairCrossings = (a: readonly number[], b: readonly number[], idx: readonly number[]) => {
  let n = 0;
  for (const x of a) for (const y of b) if (idx[x]! > idx[y]!) n++;
  return n;
};

/** Swap adjacent vertices of the same lane while that removes crossings (bounded passes). */
function transpose(layers: number[][], verts: readonly Vertex[], up: number[][], down: number[][], idx: number[], passes = 4): void {
  for (let pass = 0, improved = true; improved && pass < passes; pass++) {
    improved = false;
    for (const l of layers)
      for (let i = 0; i + 1 < l.length; i++) {
        const [a, b] = [l[i]!, l[i + 1]!];
        const [va, vb] = [verts[a]!, verts[b]!];
        if (va.group !== vb.group || (va.hint !== undefined && vb.hint !== undefined)) continue;
        const keep = pairCrossings(up[a]!, up[b]!, idx) + pairCrossings(down[a]!, down[b]!, idx);
        const swap = pairCrossings(up[b]!, up[a]!, idx) + pairCrossings(down[b]!, down[a]!, idx);
        if (swap < keep) {
          [l[i], l[i + 1]] = [b, a];
          [idx[a], idx[b]] = [i + 1, i];
          improved = true;
        }
      }
  }
}
