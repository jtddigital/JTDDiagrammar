import type { Link } from './graph.ts';

/** Links to reverse so the graph is acyclic: DFS back-edges, starting from sources in source order (URS-LY-004). */
export function backEdges(n: number, links: readonly Link[]): Set<number> {
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  links.forEach((l, i) => {
    out[l.u]!.push(i);
    indeg[l.v]!++;
  });
  const state = new Uint8Array(n); // 0 unvisited, 1 on stack, 2 done
  const back = new Set<number>();
  const visit = (u: number): void => {
    state[u] = 1;
    for (const i of out[u]!) {
      const v = links[i]!.v;
      if (state[v] === 1) back.add(i);
      else if (state[v] === 0) visit(v);
    }
    state[u] = 2;
  };
  const roots = [...Array(n).keys()].sort((a, b) => Number(indeg[a]! > 0) - Number(indeg[b]! > 0));
  for (const u of roots) if (!state[u]) visit(u);
  return back;
}
