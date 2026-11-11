import type { Link } from './graph.ts';

/** Longest-path layering of a DAG; sources are then pulled next to their earliest successor. */
export function rank(n: number, links: readonly Link[]): number[] {
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  for (const l of links) {
    out[l.u]!.push(l.v);
    indeg[l.v]!++;
  }
  const isSource = indeg.map((d) => d === 0);
  const r = new Array<number>(n).fill(0);
  const topo: number[] = [];
  const queue = [...Array(n).keys()].filter((u) => indeg[u] === 0);
  while (queue.length) {
    const u = queue.shift()!;
    topo.push(u);
    for (const v of out[u]!) {
      r[v] = Math.max(r[v]!, r[u]! + 1);
      if (--indeg[v]! === 0) queue.push(v);
    }
  }
  for (const u of topo.reverse()) if (isSource[u] && out[u]!.length) r[u] = Math.min(...out[u]!.map((v) => r[v]!)) - 1;
  return r;
}
