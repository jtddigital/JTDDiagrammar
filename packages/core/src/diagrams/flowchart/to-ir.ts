import { pointer } from '../../diagnostics.ts';
import type { GraphIR, IREdge, IRNode } from '../../ir/types.ts';
import type { FlowBand, Flowchart } from './model.ts';

const bands = (key: string, list: FlowBand[]) => list.map((b, i) => ({ ...b, src: pointer(key, i) }));

export function flowchartToIR(m: Flowchart): GraphIR {
  const nodes = m.nodes.map((n, i): IRNode => {
    const { shape = 'process', label = n.id, ...rest } = n;
    return { ...rest, shape, label, src: pointer('nodes', i) };
  });
  // Generated ids contain ':' so they cannot collide with user ids (see schema `id` pattern).
  const edges = (m.edges ?? []).map((e, i): IREdge => {
    const { fromSide, toSide, ...rest } = e;
    const ports = { ...(fromSide && { from: fromSide }), ...(toSide && { to: toSide }) };
    return { ...rest, id: e.id ?? `edge:${i}`, ...(Object.keys(ports).length && { ports }), src: pointer('edges', i) };
  });
  // Notes are nodes of their own, attached by a dotted, arrowless edge in their node's lane and phase.
  const owner = new Map(m.nodes.map((n) => [n.id, n]));
  (m.notes ?? []).forEach((note, i) => {
    const id = note.id ?? `note:${i}`;
    const target = note.for !== undefined ? owner.get(note.for) : undefined;
    const lane = note.lane ?? target?.lane;
    const phase = note.phase ?? target?.phase;
    nodes.push({ id, shape: 'note', label: note.text, ...(lane !== undefined && { lane }), ...(phase !== undefined && { phase }), ...(note.style && { style: note.style }), src: pointer('notes', i) });
    if (note.for !== undefined) edges.push({ id: `${id}:link`, from: note.for, to: id, marker: 'none', style: { dash: 'dotted' }, src: pointer('notes', i) });
  });
  const ir: GraphIR = { ...(m.title !== undefined && { title: m.title }), ...(m.theme && { theme: m.theme }), direction: m.direction ?? 'LR', nodes, edges, containers: [] };
  if (m.lanes) ir.partitions = { lanes: bands('lanes', m.lanes), ...(m.phases && { phases: bands('phases', m.phases) }) };
  return ir;
}
