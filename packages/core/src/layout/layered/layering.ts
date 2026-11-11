import { backEdges } from './cycles.ts';
import type { Link } from './graph.ts';
import { rank } from './rank.ts';

export interface Layering {
  /** Links oriented along increasing rank. */
  dag: Link[];
  /** Indices (into the input links) that were reversed. */
  back: Set<number>;
  ranks: number[];
  /** Layer range of each phase; every phase gets at least one layer. */
  phases: { first: number; last: number }[];
}

/**
 * Cycle breaking + ranking with phases as hard column groups (URS-LY-004, URS-DM-002).
 * Links into an earlier phase are reversed; ranks are computed per phase and offset.
 * Unpartitioned graphs are the one-phase case.
 */
export function layering(n: number, links: readonly Link[], phaseOf: readonly number[], phaseCount: number): Layering {
  const same = (l: Link) => phaseOf[l.u] === phaseOf[l.v];
  const intra = [...links.keys()].filter((i) => same(links[i]!));
  const intraBack = backEdges(n, intra.map((i) => links[i]!));
  const back = new Set([...intra.filter((_, k) => intraBack.has(k)), ...[...links.keys()].filter((i) => phaseOf[links[i]!.u]! > phaseOf[links[i]!.v]!)]);
  const dag = links.map((l, i) => (back.has(i) ? { edge: l.edge, u: l.v, v: l.u } : l));

  const local = rank(n, dag.filter(same));
  const size = Array<number>(phaseCount).fill(1);
  local.forEach((r, v) => (size[phaseOf[v]!] = Math.max(size[phaseOf[v]!]!, r + 1)));
  const first: number[] = [];
  size.forEach((s, p) => first.push(p ? first[p - 1]! + size[p - 1]! : 0));
  return {
    dag,
    back,
    ranks: local.map((r, v) => first[phaseOf[v]!]! + r),
    phases: size.map((s, p) => ({ first: first[p]!, last: first[p]! + s - 1 })),
  };
}
