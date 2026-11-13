import { max } from '../../math.ts';
import type { Box, PlacedNode, Point, RoutedEdge } from '../../geometry.ts';
import type { Icon, IREdge } from '../../ir/types.ts';
import { textBlock } from '../../measure/text.ts';
import { shape } from '../../shapes/library.ts';
import type { Side } from '../../shapes/shape.ts';
import { CALLOUT_GAP, entryStub, EXIT_STUB, fontOf, ICON, ICON_GAP, LABEL_BOX, LABEL_FONT, LABEL_TEXT_MAX } from '../../style.ts';
import type { Flow } from '../flow.ts';
import { simplify } from '../simplify.ts';
import { RANK_GAP, TRACK_SEP } from './constants.ts';
import { isDummy, type Chain, type Vertex } from './graph.ts';
import { mainAxis, type MainAxis, type PhaseLayers } from './main-axis.ts';

const LABEL_PAD = 12;
const LOOP = 16;
/** Extra leg length that keeps an arriving hinted leg clear of a leaving one on the same side. */
const APART = 8;

export interface SizedNode {
  id: string;
  shape: string;
  lines: string[];
  sub?: string[];
  w: number;
  h: number;
  order?: number;
  /** Label drawn beside the node; positioned after routing (URS-DM-017). */
  callout?: { lines: string[]; sub?: string[]; w: number; h: number };
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

/** The side a chain end must use when the edge asks for one other than the flow's own (URS-DM-009). */
function hintOf({ flow, chains, edges, fixed, verts }: Ctx, ci: number, end: 0 | 1): Side | undefined {
  const ch = chains[ci]!;
  const e = edges[ch.edge]!;
  const v = end === 0 ? ch.verts[0]! : ch.verts.at(-1)!;
  if (fixed?.(ch.edge, verts[v]!.node)) return undefined;
  const h = (end === 0) !== ch.reversed ? e.ports?.from : e.ports?.to;
  return h && h !== (end === 0 ? flow.mainEnd : flow.mainStart) ? h : undefined;
}

/** Ports spread along a side, ordered by the neighbour's cross position. Returns local (m, c) per chain end. */
function ports(ctx: Ctx): { chains: MC[][]; loops: Map<number, MC>; hints: (Side | undefined)[][]; apart: Set<string> } {
  const { flow, nodes, verts, chains, fixed, loops } = ctx;
  const hints = chains.map((_, ci) => [hintOf(ctx, ci, 0), hintOf(ctx, ci, 1)]);
  const hinted = new Map<string, { chain: number; end: 0 | 1; key: number }[]>();
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
      const h = hints[i]![end];
      const [map, k] = h ? [hinted, `${v}:${h}`] : [groups, `${v}:${end}`];
      map.set(k, [...(map.get(k) ?? []), { chain: i, end, key: verts[nbr]!.pos }]);
    }
  });
  const out: MC[][] = chains.map(() => []);
  const loopOut = new Map<number, MC>();
  for (const v of tipVertices(groups, nodes, verts, loops)) {
    // Straightness is judged by where each edge really goes (its far end); the side by its first hop.
    const far = (e: Entry) => verts[e.end === 0 ? chains[e.chain]!.verts.at(-1)! : chains[e.chain]!.verts[0]!]!.pos;
    const entries = [...(groups.get(`${v}:0`) ?? []), ...(groups.get(`${v}:1`) ?? [])];
    const sideOf = { ms: flow.mainStart, me: flow.mainEnd, cs: flow.crossStart, ce: flow.crossEnd } as const;
    // Tips a side hint has claimed are not handed out again.
    const claimed = (Object.keys(sideOf) as Tip[]).filter((t) => hinted.has(`${v}:${sideOf[t]}`));
    const tips = allocateTips(entries.map((e) => ({ ...e, align: Math.abs(far(e) - verts[v]!.pos) })), verts[v]!.pos, claimed);
    if (!tips) continue;
    const n = nodes[verts[v]!.node]!;
    entries.forEach((e, i) => {
      out[e.chain]![e.end] = flow.local(shape(n.shape).port(sideOf[tips[i]!], n.w, n.h, 0));
      // A side tip is routed like a side hint: a stub straight out of the tip first (URS-LY-013).
      if (tips[i] === 'cs' || tips[i] === 'ce') hints[e.chain]![e.end] = sideOf[tips[i]!];
    });
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
  for (const [k, list] of hinted) {
    const [v, side] = k.split(':') as [string, Side];
    const n = nodes[verts[Number(v)]!.node]!;
    // A shape with tips has one per side: hinted ends on that side share it.
    const spread = !shape(n.shape).tips;
    // Ties: arriving ends upstream of leaving ones, so a leg that turns downstream does not cross one coming in.
    const arrives = (e: Entry) => Number((e.end === 1) !== chains[e.chain]!.reversed);
    list.sort((a, b) => a.key - b.key || arrives(b) - arrives(a) || a.chain - b.chain);
    list.forEach((e, j) => (out[e.chain]![e.end] = flow.local(shape(n.shape).port(side, n.w, n.h, list.length === 1 || !spread ? 0 : -1 + (2 * j) / (list.length - 1)))));
  }
  // Arriving hinted ends that share their side with a leaving one.
  const apart = new Set<string>();
  for (const list of hinted.values()) {
    const arrives = list.map((e) => (e.end === 1) !== chains[e.chain]!.reversed);
    if (arrives.includes(true) && arrives.includes(false)) list.forEach((e, i) => arrives[i] && apart.add(`${e.chain}:${e.end}`));
  }
  return { chains: out, loops: loopOut, hints, apart };
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
export function allocateTips(entries: readonly (Entry & { align: number })[], pos: number, claimed: readonly Tip[] = []): Tip[] | undefined {
  if (entries.length > 4 - claimed.length) return undefined;
  const cost = (e: Entry & { align: number }, t: Tip): number => {
    const home = e.end === 1 ? 'ms' : 'me';
    // An edge whose far end is aligned runs straight from its home tip, saving two bends; other ties go to the best aligned.
    if (t === home) return e.align < 0.5 ? -1 : e.align / 1e4;
    if (t === (e.end === 1 ? 'me' : 'ms')) return Infinity;
    return 1 + (((e.key < pos) === (t === 'cs')) ? 0 : 0.5);
  };
  let best: { total: number; tips: Tip[] } | undefined;
  const all = (['ms', 'me', 'cs', 'ce'] as Tip[]).filter((t) => !claimed.includes(t));
  const search = (i: number, used: Tip[], total: number): void => {
    if (total >= (best?.total ?? Infinity)) return;
    if (i === entries.length) return void (best = { total, tips: [...used] });
    for (const t of all) if (!used.includes(t)) search(i + 1, [...used, t], total + cost(entries[i]!, t));
  };
  search(0, [], 0);
  return best?.tips;
}

interface Measured {
  lines: string[];
  w: number;
  h: number;
  at?: number;
  icon?: Icon;
}
/** An edge's labels, measured with their margin (URS-DM-024). */
export const labelsOf = (e: IREdge): Measured[] =>
  (e.labels ?? []).map((l) => {
    const t = textBlock(l.text, LABEL_TEXT_MAX, fontOf(LABEL_FONT, e.style));
    // An icon sits before the text (URS-DM-025).
    const icon = l.icon ? ICON + ICON_GAP : 0;
    return { lines: t.lines, w: t.width + icon + 2 * LABEL_BOX.x, h: Math.max(t.height, l.icon ? ICON : 0) + 2 * LABEL_BOX.y, ...(l.at !== undefined && { at: l.at }), ...(l.icon && { icon: l.icon }) };
  });
/** Space between labels on one edge. */
const LABEL_SEP = 6;

/** Orthogonal routing through the gaps between layers (URS-LY-005). */
export function route(ctx: Ctx): { nodes: PlacedNode[]; edges: RoutedEdge[]; axis: MainAxis } {
  const { flow, nodes, verts, layers, chains, edges } = ctx;
  const { chains: port, loops: loopPort, hints, apart } = ports(ctx);
  const extent = layers.map((l) => max(l.map((v) => Math.max(verts[v]!.main, verts[v]!.reach ?? 0))));
  const crossStart = (v: number) => verts[v]!.pos - verts[v]!.cross / 2;
  /** Leg length at a chain end: room for the arrowhead and a visible line where the edge arrives, else the exit stub (URS-LY-013). */
  const stub = (ci: number, end: 0 | 1) => {
    const e = edges[chains[ci]!.edge]!;
    return (end === 1) !== chains[ci]!.reversed ? entryStub(e.style, e.marker) : EXIT_STUB;
  };
  /** Distance tracks keep from the nodes on either side of a gap. */
  const clear = Math.max(EXIT_STUB, ...edges.map((e) => entryStub(e.style, e.marker)));

  /** Cross coordinate a side-hinted end runs along once clear of its node: just outside the hinted side, or, for the far main side, outside the cross side facing its neighbour. */
  const detourC = (ci: number, end: 0 | 1): number => {
    const ch = chains[ci]!;
    const [v, nbr] = end === 0 ? [ch.verts[0]!, ch.verts[1]!] : [ch.verts.at(-1)!, ch.verts.at(-2)!];
    const [cs, ce] = [crossStart(v), crossStart(v) + verts[v]!.cross];
    const h = hints[ci]![end]!;
    // An arriving leg beside a leaving one on the same side runs further out, so the two stay apart.
    const s = stub(ci, end) + (apart.has(`${ci}:${end}`) ? APART : 0);
    if (h === flow.crossStart) return cs - s;
    if (h === flow.crossEnd) return ce + s;
    return verts[nbr]!.pos >= verts[v]!.pos ? ce + s : cs - s;
  };

  // Cross coordinate where each chain leaves/enters each of its vertices.
  const exitC = (ci: number, i: number) =>
    i === 0 ? (hints[ci]![0] ? detourC(ci, 0) : crossStart(chains[ci]!.verts[0]!) + port[ci]![0]!.c) : verts[chains[ci]!.verts[i]!]!.pos;
  const entryC = (ci: number, i: number) =>
    i === chains[ci]!.verts.length - 1
      ? hints[ci]![1]
        ? detourC(ci, 1)
        : crossStart(chains[ci]!.verts[i]!) + port[ci]![1]!.c
      : verts[chains[ci]!.verts[i]!]!.pos;

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
  const labels = edges.map(labelsOf);
  const labelMain = layers.map(() => 0);
  for (const ch of chains) {
    // Room for every label of the edge side by side, so pinned and free ones need not overlap.
    const ls = labels[ch.edge]!;
    const room = ls.reduce((n, b) => n + flow.main(b.w, b.h), 0) + LABEL_SEP * Math.max(0, ls.length - 1);
    const l = verts[ch.verts[0]!]!.layer;
    labelMain[l] = Math.max(labelMain[l]!, room);
  }
  const gap = layers.map((_, g) => Math.max(RANK_GAP, 2 * clear + TRACK_SEP * (tracks[g]! - 1), labelMain[g]! + 2 * LABEL_PAD));
  const axis = mainAxis(extent, gap, ctx.phases);
  const start = axis.start;
  const gapStart = (l: number) => start[l]! + extent[l]!;
  // Actual gap: phase padding can make it wider than `gap`.
  const gapLen = (l: number) => start[l + 1]! - gapStart(l);
  // Tracks keep `clear` from both sides so every leg into a node shows its line past the arrowhead (URS-LY-013).
  const trackM = (l: number, key: string) => {
    const [k, n] = [track.get(key), tracks[l]!];
    const [a, b] = [gapStart(l) + clear, start[l + 1]! - clear];
    return k === undefined || n <= 1 ? (a + b) / 2 : a + (k * (b - a)) / (n - 1);
  };

  const mainStart = (v: number) => start[verts[v]!.layer]! + (extent[verts[v]!.layer]! - verts[v]!.main) / 2;
  const at = (v: number, p: MC): MC => ({ m: mainStart(v) + p.m, c: crossStart(v) + p.c });
  const xy = (p: MC) => flow.toXY(p.m, p.c);
  const box = (center: MC, w: number, h: number): Box => {
    const p = xy(center);
    return { x: p.x - w / 2, y: p.y - h / 2, w, h };
  };
  /** Every label starts at the router's spot; placeLabels moves pinned ones to their place and spreads the rest. */
  const placedLabels = (ls: readonly Measured[], spot: MC) => (ls.length ? { labels: ls.map(({ w, h, ...l }) => ({ ...box(spot, w, h), ...l })) } : {});

  const routed: RoutedEdge[] = chains.map((ch, ci) => {
    const e = edges[ch.edge]!;
    const last = ch.verts.length - 1;
    // Side-hinted ends: a stub out of the node (and round it, for the far side) before joining the gaps.
    const head = (): MC[] => {
      const v = ch.verts[0]!;
      const p = at(v, port[ci]![0]!);
      const h = hints[ci]![0];
      if (!h) return [p];
      const c = detourC(ci, 0);
      if (h !== flow.mainStart) return [p, { m: p.m, c }];
      const m = mainStart(v) - stub(ci, 0);
      return [p, { m, c: p.c }, { m, c }];
    };
    const tail = (): MC[] => {
      const v = ch.verts[last]!;
      const p = at(v, port[ci]![1]!);
      const h = hints[ci]![1];
      if (!h) return [p];
      const c = detourC(ci, 1);
      if (h !== flow.mainEnd) return [{ m: p.m, c }, p];
      const m = mainStart(v) + verts[v]!.main + stub(ci, 1);
      return [{ m, c }, { m, c: p.c }, p];
    };
    const pts: MC[] = head();
    const end = tail();
    let label: MC | undefined;
    for (let i = 0; i < last; i++) {
      const a = ch.verts[i]!;
      const b = ch.verts[i + 1]!;
      const l = verts[a]!.layer;
      const [c1, c2] = [exitC(ci, i), entryC(ci, i + 1)];
      const entry: MC = i + 1 === last ? end[0]! : { m: start[l + 1]!, c: c2 };
      if (c1 !== c2) {
        const m = trackM(l, `${ci}:${i}`);
        pts.push({ m, c: c1 }, { m, c: c2 });
        if (i === 0) label = { m, c: (c1 + c2) / 2 };
      } else if (i === 0) label = { m: gapStart(l) + gapLen(l) / 2, c: c1 };
      pts.push(entry);
      if (isDummy(verts[b]!)) pts.push({ m: gapStart(l + 1), c: c2 });
    }
    pts.push(...end.slice(1));
    if (ch.reversed) pts.reverse();
    return { id: e.id, from: e.from, to: e.to, points: simplify(pts.map(xy)), ...(label && placedLabels(labels[ch.edge]!, label)) };
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
    const pts: MC[] = [p0, { m: p0.m + LOOP, c: p0.c }, { m: p0.m + LOOP, c: top }, { m: p4.m, c: top }, p4];
    routed.push({
      id: e.id,
      from: e.from,
      to: e.to,
      points: simplify(pts.map(xy)),
      ...placedLabels(labels[edge]!, { m: (p0.m + LOOP + p4.m) / 2, c: top }),
    });
  }
  const rank = new Map(edges.map((e, i) => [e.id, i]));
  routed.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);

  const placed: PlacedNode[] = verts.flatMap((v, i) => {
    if (isDummy(v)) return [];
    const n = nodes[v.node]!;
    const p = xy({ m: mainStart(i), c: crossStart(i) });
    // Callouts start in the room reserved past the node (URS-DM-017); placeLabels moves them only if that spot is blocked.
    const c = n.callout;
    const at = c && xy({ m: mainStart(i) + (v.main - flow.main(c.w, c.h)) / 2, c: crossStart(i) + v.cross + CALLOUT_GAP });
    const callout = c && at && { ...c, ...at, leader: [p, p] as [Point, Point] };
    return [{ id: n.id, shape: n.shape, lines: n.lines, ...(n.sub && { sub: n.sub }), x: p.x, y: p.y, w: n.w, h: n.h, ...(callout && { callout }) }];
  });
  return { nodes: placed, edges: routed, axis };
}
