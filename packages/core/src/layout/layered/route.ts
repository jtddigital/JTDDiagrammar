import type { Box, PlacedNode, RoutedEdge } from '../../geometry.ts';
import type { IREdge } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import { shape } from '../../shapes/library.ts';
import type { Side } from '../../shapes/shape.ts';
import { LABEL_FONT, LABEL_TEXT_MAX } from '../../style.ts';
import type { Flow } from '../flow.ts';
import { simplify } from '../simplify.ts';
import { isDummy, type Chain, type Vertex } from './graph.ts';

export const RANK_GAP = 56;
export const TRACK_SEP = 12;
const LABEL_PAD = 12;
const LOOP = 16;

export interface SizedNode {
  id: string;
  shape: string;
  lines: string[];
  w: number;
  h: number;
}

interface Ctx {
  flow: Flow;
  nodes: readonly SizedNode[];
  verts: readonly Vertex[];
  layers: readonly number[][];
  chains: readonly Chain[];
  edges: readonly IREdge[];
  loops: readonly { edge: number; node: number }[];
}

type MC = { m: number; c: number };

/** Ports spread along a side, ordered by the neighbour's cross position. Returns local (m, c) per chain end. */
function ports({ flow, nodes, verts, chains }: Ctx): MC[][] {
  const groups = new Map<string, { chain: number; end: 0 | 1; key: number }[]>();
  chains.forEach((ch, i) => {
    const ends = [
      [0, ch.verts[0]!, ch.verts[1]!],
      [1, ch.verts.at(-1)!, ch.verts.at(-2)!],
    ] as const;
    for (const [end, v, nbr] of ends) {
      const k = `${v}:${end}`;
      groups.set(k, [...(groups.get(k) ?? []), { chain: i, end, key: verts[nbr]!.pos }]);
    }
  });
  const out: MC[][] = chains.map(() => []);
  for (const [k, list] of groups) {
    const [v, end] = k.split(':').map(Number) as [number, 0 | 1];
    const n = nodes[verts[v]!.node]!;
    const side: Side = end === 0 ? flow.mainEnd : flow.mainStart;
    list.sort((a, b) => a.key - b.key || a.chain - b.chain);
    list.forEach((e, j) => {
      const t = list.length === 1 ? 0 : -1 + (2 * j) / (list.length - 1);
      out[e.chain]![e.end] = flow.local(shape(n.shape).port(side, n.w, n.h, t));
    });
  }
  return out;
}

const labelOf = (e: IREdge) => (e.label ? textBlock(e.label, LABEL_TEXT_MAX, LABEL_FONT) : undefined);

/** Orthogonal routing through the gaps between layers (URS-LY-005). */
export function route(ctx: Ctx): { nodes: PlacedNode[]; edges: RoutedEdge[] } {
  const { flow, nodes, verts, layers, chains, edges } = ctx;
  const port = ports(ctx);
  const extent = layers.map((l) => Math.max(0, ...l.map((v) => verts[v]!.main)));
  const crossStart = (v: number) => verts[v]!.pos - verts[v]!.cross / 2;

  // Cross coordinate where each chain leaves/enters each of its vertices.
  const exitC = (ci: number, i: number) => (i === 0 ? crossStart(chains[ci]!.verts[0]!) + port[ci]![0]!.c : verts[chains[ci]!.verts[i]!]!.pos);
  const entryC = (ci: number, i: number) =>
    i === chains[ci]!.verts.length - 1 ? crossStart(chains[ci]!.verts[i]!) + port[ci]![1]!.c : verts[chains[ci]!.verts[i]!]!.pos;

  // Assign each jog (cross-axis segment) in a gap to a track; overlapping jogs get different tracks.
  const track = new Map<string, number>();
  const tracks = layers.map(() => 0);
  const jogs = layers.map((): { key: string; lo: number; hi: number }[] => []);
  chains.forEach((ch, ci) =>
    ch.verts.slice(1).forEach((_, i) => {
      const [c1, c2] = [exitC(ci, i), entryC(ci, i + 1)];
      if (Math.abs(c1 - c2) >= 1) jogs[verts[ch.verts[i]!]!.layer]!.push({ key: `${ci}:${i}`, lo: Math.min(c1, c2), hi: Math.max(c1, c2) });
    }),
  );
  jogs.forEach((list, g) => {
    const ends: number[] = [];
    for (const j of list.sort((a, b) => a.lo - b.lo || a.hi - b.hi)) {
      let k = ends.findIndex((e) => e < j.lo - 1);
      if (k < 0) k = ends.push(j.hi) - 1;
      else ends[k] = j.hi;
      track.set(j.key, k);
    }
    tracks[g] = ends.length;
  });

  // Gap sizes: room for tracks and for labels placed in the edge's first gap.
  const labels = edges.map(labelOf);
  const labelMain = layers.map(() => 0);
  for (const ch of chains) {
    const b = labels[ch.edge];
    if (b) labelMain[verts[ch.verts[0]!]!.layer] = Math.max(labelMain[verts[ch.verts[0]!]!.layer]!, flow.main(b.width + 8, b.height + 4));
  }
  const gap = layers.map((_, g) => Math.max(RANK_GAP, TRACK_SEP * (tracks[g]! + 1), labelMain[g]! + 2 * LABEL_PAD));
  const start: number[] = [];
  layers.forEach((_, l) => start.push(l ? start[l - 1]! + extent[l - 1]! + gap[l - 1]! : 0));
  const gapStart = (l: number) => start[l]! + extent[l]!;
  const trackM = (l: number, key: string) => {
    const k = track.get(key);
    return gapStart(l) + (k === undefined ? gap[l]! / 2 : ((k + 1) * gap[l]!) / (tracks[l]! + 1));
  };

  const mainStart = (v: number) => start[verts[v]!.layer]! + (extent[verts[v]!.layer]! - verts[v]!.main) / 2;
  const at = (v: number, p: MC): MC => ({ m: mainStart(v) + p.m, c: crossStart(v) + p.c });
  const xy = (p: MC) => flow.toXY(p.m, p.c);
  const box = (center: MC, w: number, h: number): Box => {
    const p = xy(center);
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  };

  const routed: RoutedEdge[] = chains.map((ch, ci) => {
    const e = edges[ch.edge]!;
    const last = ch.verts.length - 1;
    const pts: MC[] = [at(ch.verts[0]!, port[ci]![0]!)];
    let label: MC | undefined;
    for (let i = 0; i < last; i++) {
      const a = ch.verts[i]!;
      const b = ch.verts[i + 1]!;
      const l = verts[a]!.layer;
      const [c1, c2] = [exitC(ci, i), entryC(ci, i + 1)];
      const entry: MC = i + 1 === last ? at(b, port[ci]![1]!) : { m: start[l + 1]!, c: c2 };
      if (c1 !== c2) {
        const m = trackM(l, `${ci}:${i}`);
        pts.push({ m, c: c1 }, { m, c: c2 });
        if (i === 0) label = { m, c: (c1 + c2) / 2 };
      } else if (i === 0) label = { m: gapStart(l) + gap[l]! / 2, c: c1 };
      pts.push(entry);
      if (isDummy(verts[b]!)) pts.push({ m: gapStart(l + 1), c: c2 });
    }
    if (ch.reversed) pts.reverse();
    const b = labels[ch.edge];
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      points: simplify(pts.map(xy)),
      ...(b && label && { label: { ...box(label, b.width + 8, b.height + 4), lines: b.lines } }),
    };
  });

  // Self-loops: out of the flow-end side, around the cross-start side, back in (URS-LY-011, basic).
  const vertexOf = new Map(verts.map((v, i) => [v.node, i]));
  for (const { edge, node } of ctx.loops) {
    const v = vertexOf.get(node)!;
    const n = nodes[node]!;
    const s = shape(n.shape);
    const p0 = at(v, flow.local(s.port(flow.mainEnd, n.w, n.h, 0)));
    const p4 = at(v, flow.local(s.port(flow.crossStart, n.w, n.h, 0)));
    const top = crossStart(v) - LOOP;
    const e = edges[edge]!;
    const b = labels[edge];
    const pts: MC[] = [p0, { m: p0.m + LOOP, c: p0.c }, { m: p0.m + LOOP, c: top }, { m: p4.m, c: top }, p4];
    routed.push({
      id: e.id,
      from: e.from,
      to: e.to,
      points: simplify(pts.map(xy)),
      ...(b && { label: { ...box({ m: (p0.m + LOOP + p4.m) / 2, c: top }, b.width + 8, b.height + 4), lines: b.lines } }),
    });
  }
  const rank = new Map(edges.map((e, i) => [e.id, i]));
  routed.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);

  const placed: PlacedNode[] = verts.flatMap((v, i) => {
    if (isDummy(v)) return [];
    const n = nodes[v.node]!;
    const p = xy({ m: mainStart(i), c: crossStart(i) });
    return [{ id: n.id, shape: n.shape, lines: n.lines, x: p.x, y: p.y, w: n.w, h: n.h }];
  });
  return { nodes: placed, edges: routed };
}
