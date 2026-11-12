import type { IRNode } from '../../ir/types.ts';
import { lineHeight, textBlock, type Font } from '../../measure/text.ts';
import { shape } from '../../shapes/library.ts';
import { innerOf, type Shape } from '../../shapes/shape.ts';
import { CALLOUT_GAP, CALLOUT_PAD, CALLOUT_TEXT_MAX, fontOf, NODE_FONT, NODE_TEXT_MAX, STANDARD_TEXT_W, stackHeight, subFont } from '../../style.ts';
import type { Flow } from '../flow.ts';
import type { Chain, Link, Vertex } from './graph.ts';
import type { SizedNode } from './route.ts';

/** Label (and secondary text under a divider, URS-DM-021) measured as one block. */
interface Stack {
  lines: string[];
  sub?: string[];
  width: number;
  height: number;
}
const stack = (label: string, sub: string | undefined, max: number, font: Font): Stack => {
  const t = textBlock(label, max, font);
  const u = sub ? textBlock(sub, max, subFont(font)) : undefined;
  return { lines: t.lines, ...(u && { sub: u.lines }), width: Math.max(t.width, u?.width ?? 0), height: stackHeight(t.lines.length, u?.lines.length ?? 0, font) };
};
const text = ({ lines, sub }: Stack) => ({ lines, ...(sub && { sub }) });

/** The text wrapped to fit inside a w × h shape, or undefined when it cannot fit. */
function fitInside(n: IRNode, s: Shape, w: number, h: number, font: Font): Stack | undefined {
  const inner = innerOf(s, w, h);
  for (let tw = inner.w; tw >= 16; tw -= 8) {
    const t = stack(n.label, n.sub, tw, font);
    if (t.width <= inner.w + 0.5 && t.height <= inner.h + 0.5) return t;
  }
  return undefined;
}

/**
 * Measure a node's label and size its shape. By default the shape grows to fit its label. A fixed
 * `width`/`height`, or `label: callout | auto`, keeps the standard size instead, and the label goes
 * inside when it fits or into a callout beside the node (URS-DM-017).
 */
export function sized(n: IRNode): SizedNode {
  const st = n.style;
  const s = shape(n.shape);
  const font = fontOf(NODE_FONT, st);
  const base = { id: n.id, shape: n.shape, ...(n.order !== undefined && { order: n.order }) };
  const mode = st?.label ?? 'inside';
  // Symbols without labels (pseudostates) keep their own size.
  if (s.unlabelled || (mode === 'inside' && st?.width === undefined && st?.height === undefined)) {
    const t = stack(n.label, n.sub, NODE_TEXT_MAX, font);
    return { ...base, ...text(t), ...s.size(t.width, t.height) };
  }
  const std = s.size(STANDARD_TEXT_W, 2 * lineHeight(font));
  const [w, h] = [st?.width ?? std.w, st?.height ?? std.h];
  if (!n.label && !n.sub) return { ...base, lines: [], w, h };
  const fit = fitInside(n, s, w, h, font);
  if (mode === 'inside') return { ...base, ...text(fit ?? stack(n.label, n.sub, Math.max(16, innerOf(s, w, h).w), font)), w, h };
  if (mode === 'auto' && fit) return { ...base, ...text(fit), w, h };
  const c = stack(n.label, n.sub, CALLOUT_TEXT_MAX, font);
  return { ...base, lines: [], w, h, callout: { ...text(c), w: c.width + 2 * CALLOUT_PAD.x, h: c.height + 2 * CALLOUT_PAD.y } };
}

/** Split each link into one segment per layer, inserting dummy vertices (Sugiyama). Dummies join the lane of the chain's first vertex. */
export function build(nodes: readonly SizedNode[], laneOf: readonly number[], ranks: readonly number[], layerCount: number, dag: readonly Link[], back: ReadonlySet<number>, flow: Flow) {
  const verts: Vertex[] = nodes.map((n, i) => ({
    node: i,
    layer: ranks[i]!,
    group: laneOf[i]!,
    main: flow.main(n.w, n.h),
    cross: flow.cross(n.w, n.h),
    pos: 0,
    ...(n.order !== undefined && { hint: n.order }),
    ...(shape(n.shape).tips && { tips: true }),
    ...(n.callout && { after: CALLOUT_GAP + flow.cross(n.callout.w, n.callout.h), reach: flow.main(n.callout.w, n.callout.h) }),
  }));
  const chains: Chain[] = dag.map((l, i) => {
    const vs = [l.u];
    for (let r = ranks[l.u]! + 1; r < ranks[l.v]!; r++) vs.push(verts.push({ node: -1, layer: r, group: laneOf[l.u]!, main: 0, cross: 0, pos: 0 }) - 1);
    return { edge: l.edge, reversed: back.has(i), verts: [...vs, l.v] };
  });
  const layers: number[][] = Array.from({ length: layerCount }, () => []);
  verts.forEach((v, i) => layers[v.layer]!.push(i));
  return { verts, chains, layers };
}
