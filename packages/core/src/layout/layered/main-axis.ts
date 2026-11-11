import { RANK_GAP } from './constants.ts';
import type { Span } from './graph.ts';

export interface PhaseLayers {
  first: number;
  last: number;
  /** Minimum length along the flow (e.g. to fit the header label). */
  min: number;
}

export interface MainAxis {
  /** Start of each layer along the flow. */
  start: number[];
  /** Extent of each phase band (empty when unpartitioned). */
  spans: Span[];
  length: number;
}

/**
 * Layer positions along the flow. With phases, each phase is padded, meets its minimum length
 * with its content centred, and phase boundaries fall inside the gaps between layers.
 */
export function mainAxis(extent: readonly number[], gap: readonly number[], phases?: readonly PhaseLayers[]): MainAxis {
  const start: number[] = [];
  if (!phases) {
    extent.forEach((_, l) => start.push(l ? start[l - 1]! + extent[l - 1]! + gap[l - 1]! : 0));
    return { start, spans: [], length: extent.length ? start.at(-1)! + extent.at(-1)! : 0 };
  }
  const spans: Span[] = [];
  let s = 0;
  for (const p of phases) {
    const lead = p.first === 0 ? RANK_GAP / 2 : gap[p.first - 1]! / 2;
    const trail = p.last === extent.length - 1 ? RANK_GAP / 2 : gap[p.last]! / 2;
    let content = lead + trail;
    for (let l = p.first; l <= p.last; l++) content += extent[l]! + (l < p.last ? gap[l]! : 0);
    const len = Math.max(content, p.min);
    let m = s + lead + (len - content) / 2;
    for (let l = p.first; l <= p.last; l++) {
      start[l] = m;
      m += extent[l]! + gap[l]!;
    }
    spans.push({ start: s, end: s + len });
    s += len;
  }
  return { start, spans, length: s };
}
