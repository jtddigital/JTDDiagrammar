import { max } from '../../math.ts';
import type { Box, PlacedNode, RoutedEdge } from '../../geometry.ts';
import type { IREdge } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import { shape } from '../../shapes/library.ts';
import type { Side } from '../../shapes/shape.ts';
import { LABEL_FONT, LABEL_TEXT_MAX } from '../../style.ts';
import type { Flow } from '../flow.ts';
import { simplify } from '../simplify.ts';
import { RANK_GAP, TRACK_SEP } from './constants.ts';
import { isDummy, type Chain, type Vertex } from './graph.ts';
import { mainAxis, type MainAxis, type PhaseLayers } from './main-axis.ts';

const LABEL_PAD = 12;
const LOOP = 16;

export interface SizedNode {
  id: string;
  shape: string;
  lines: string[];
  w: number;
  h: number;
  order?: number;
}

interface Ctx {
  flow: Flow;
  nodes: readonly SizedNode[];
  verts: readonly Vertex[];
  layers: readonly number[][];
  chains: readonly Chain[];
  edges: readonly IREdge[];
  loops: readonly { edge: number; node: number }[];
  phases?: readonly PhaseLayers[];
  /** Pinned attachment (local m, c) for an edge at a node, e.g. a container's border port. */
  fixed?(edge: number, node: number): MC | undefined;
}

export type MC = { m: number; c: number };

/** Ports spread along a side, ordered by the neighbour's cross position. Returns local (m, c) per chain end. */
function ports({ flow, nodes, verts, chains, fixed, loops }: Ctx): { chains: MC[][]; loops: Map<number, MC> } {
  const groups = new Map<string, { chain: number; end: 0 | 1; key: number }[]>();
  // Self-loops leave from the flow-end side too; they sort first, next to the corner they turn towards.
  loops.forEach((l, i) => {
    const k = `${l.node}:0`;
    groups.set(k, [...(groups.get(k) ?? []), { chain: -1 - i, end: 0, key: -Infinity }]);
  });
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
  const loopOut = new Map<number, MC>();
  for (const v of tipVertices(groups, nodes, verts, loops)) {
    // Straightness is judged by where each edge really goes (its far end); the side by its first hop.
    const far = (e: Entry) => verts[e.end === 0 ? chains[e.chain]!.verts.at(-1)! : chains[e.chain]!.verts[0]!]!.pos;
    const entries = [...(groups.get(`${v}:0`) ?? []), ...(groups.get(`${v}:1`) ?? [])];
    const tips = allocateTips(entries.map((e) => ({ ...e, align: Math.abs(far(e) - verts[v]!.pos) })), verts[v]!.pos);
    if (!tips) continue;
    const n = nodes[verts[v]!.node]!;
    const sideOf = { ms: flow.mainStart, me: flow.mainEnd, cs: flow.crossStart, ce: flow.crossEnd } as const;
    entries.forEach((e, i) => (out[e.chain]![e.end] = flow.local(shape(n.shape).port(sideOf[tips[i]!], n.w, n.h, 0))));
    groups.delete(`${v}:0`);
    groups.delete(`${v}:1`);
  }
  for (const [k, list] of groups) {
    const [v, end] = k.split(':').map(Number) as [number, 0 | 1];
    const n = nodes[verts[v]!.node]!;
    const side: Side = end === 0 ? flow.mainEnd : flow.mainStart;
    const free = list.filter((e) => {
      const f = e.chain >= 0 ? fixed?.(chains[e.chain]!.edge, verts[v]!.node) : undefined;
      if (f) out[e.chain]![e.end] = f;
      return !f;
    });
    free.sort((a, b) => a.key - b.key || a.chain - b.chain);
    free.forEach((e, j) => {
      const t = free.length === 1 ? 0 : -1 + (2 * j) / (free.length - 1);
      const p = flow.local(shape(n.shape).port(side, n.w, n.h, t));
      if (e.chain >= 0) out[e.chain]![e.end] = p;
      else loopOut.set(loops[-1 - e.chain]!.edge, p);
    });
  }
  return { chains: out, loops: loopOut };
}

/** A cross-axis segment in a gap: enters at c1, leaves at c2. */
interface Jog {
  key: string;
  c1: number;
  c2: number;
  lo: number;
  hi: number;
}

const within = (v: number, j: Jog) => v > j.lo + 0.5 && v < j.hi - 0.5;

/** Crossings caused by putting track `a` before track `b` (a's verticals vs b's inbound legs, b's verticals vs a's outbound legs). */
const trackCost = (a: readonly Jog[], b: readonly Jog[]) =>
  a.reduce((n, x) => n + b.reduce((m, y) => m + Number(within(y.c1, x)) + Number(within(x.c2, y)), 0), 0);

/** Order a gap's tracks by adjacent swaps that remove crossings (URS-LY-007). Returns track ids in order. */
function orderTracks(members: readonly Jog[][]): number[] {
  const perm = members.map((_, i) => i);
  for (let pass = 0, swapped = true; swapped && pass < perm.length; pass++) {
    swapped = false;
    for (let i = 0; i + 1 < perm.length; i++) {
      const [a, b] = [members[perm[i]!]!, members[perm[i + 1]!]!];
      if (trackCost(b, a) < trackCost(a, b)) {
        [perm[i], perm[i + 1]] = [perm[i + 1]!, perm[i]!];
        swapped = true;
      }
    }
  }
  return perm;
}

type Tip = 'ms' | 'me' | 'cs' | 'ce';
type Entry = { chain: number; end: 0 | 1; key: number };

/** Vertices whose shape attaches edges at its four tips (and has no self-loop to fit in as well). */
function tipVertices(groups: Map<string, Entry[]>, nodes: readonly SizedNode[], verts: readonly Vertex[], loops: Ctx['loops']): number[] {
  const vs = new Set([...groups.keys()].map((k) => Number(k.split(':')[0])));
  return [...vs].filter((v) => shape(nodes[verts[v]!.node]!.shape).tips && !loops.some((l) => l.node === verts[v]!.node));
}

/**
 * Give each edge of a diamond its own tip (≤ 4 edges): edges arriving on the flow-start side prefer the
 * start tip, edges leaving on the flow-end side the end tip, otherwise the side tip facing the other end.
 * No edge is routed through the diamond. Returns undefined (fall back to shared tips) when it cannot.
 */
export function allocateTips(entries: readonly (Entry & { align: number })[], pos: number): Tip[] | undefined {
  if (entries.length > 4) return undefined;
  const cost = (e: Entry & { align: number }, t: Tip): number => {
    const home = e.end === 1 ? 'ms' : 'me';
    // Ties go to the edge whose far end is best aligned, which can then run straight.
    if (t === home) return e.align / 1e4;
    if (t === (e.end === 1 ? 'me' : 'ms')) return Infinity;
    return 1 + (((e.key < pos) === (t === 'cs')) ? 0 : 0.5);
  };
  let best: { total: number; tips: Tip[] } | undefined;
  const all: Tip[] = ['ms', 'me', 'cs', 'ce'];
  const search = (i: number, used: Tip[], total: number): void => {
    if (total >= (best?.total ?? Infinity)) return;
    if (i === entries.length) return void (best = { total, tips: [...used] });
    for (const t of all) if (!used.includes(t)) search(i + 1, [...used, t], total + cost(entries[i]!, t));
  };
  search(0, [], 0);
  return best?.tips;
}

const labelOf = (e: IREdge) => (e.label ? textBlock(e.label, LABEL_TEXT_MAX, LABEL_FONT) : undefined);

/** Orthogonal routing through the gaps between layers (URS-LY-005). */
export function route(ctx: Ctx): { nodes: PlacedNode[]; edges: RoutedEdge[]; axis: MainAxis } {
  const { flow, nodes, verts, layers, chains, edges } = ctx;
  const { chains: port, loops: loopPort } = ports(ctx);
  const extent = layers.map((l) => max(l.map((v) => verts[v]!.main)));
  const crossStart = (v: number) => verts[v]!.pos - verts[v]!.cross / 2;

  // Cross coordinate where each chain leaves/enters each of its vertices.
  const exitC = (ci: number, i: number) => (i === 0 ? crossStart(chains[ci]!.verts[0]!) + port[ci]![0]!.c : verts[chains[ci]!.verts[i]!]!.pos);
  const entryC = (ci: number, i: number) =>
    i === chains[ci]!.verts.length - 1 ? crossStart(chains[ci]!.verts[i]!) + port[ci]![1]!.c : verts[chains[ci]!.verts[i]!]!.pos;

  // Assign each jog (cross-axis segment) in a gap to a track; overlapping jogs get different tracks.
  const track = new Map<string, number>();
  const tracks = layers.map(() => 0);
  const jogs = layers.map((): Jog[] => []);
  chains.forEach((ch, ci) =>
    ch.verts.slice(1).forEach((_, i) => {
      const [c1, c2] = [exitC(ci, i), entryC(ci, i + 1)];
      if (Math.abs(c1 - c2) >= 1) jogs[verts[ch.verts[i]!]!.layer]!.push({ key: `${ci}:${i}`, c1, c2, lo: Math.min(c1, c2), hi: Math.max(c1, c2) });
    }),
  );
  jogs.forEach((list, g) => {
    const ends: number[] = [];
    const members: Jog[][] = [];
    for (const j of list.sort((a, b) => a.lo - b.lo || a.hi - b.hi)) {
      let k = ends.findIndex((e) => e < j.lo - 1);
      if (k < 0) k = ends.push(j.hi) - 1;
      else ends[k] = j.hi;
      (members[k] ??= []).push(j);
    }
    orderTracks(members).forEach((k, pos) => members[k]!.forEach((j) => track.set(j.key, pos)));
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
  const axis = mainAxis(extent, gap, ctx.phases);
  const start = axis.start;
  const gapStart = (l: number) => start[l]! + extent[l]!;
  // Actual gap: phase padding can make it wider than `gap`.
  const gapLen = (l: number) => start[l + 1]! - gapStart(l);
  const trackM = (l: number, key: string) => {
    const k = track.get(key);
    return gapStart(l) + (k === undefined ? gapLen(l) / 2 : ((k + 1) * gapLen(l)) / (tracks[l]! + 1));
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
      } else if (i === 0) label = { m: gapStart(l) + gapLen(l) / 2, c: c1 };
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
    const p0 = at(v, loopPort.get(edge)!);
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
  return { nodes: placed, edges: routed, axis };
}
