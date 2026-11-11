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
  const edges = (m.edges ?? []).map((e, i): IREdge => ({ ...e, id: e.id ?? `edge:${i}`, src: pointer('edges', i) }));
  const ir: GraphIR = { direction: m.direction ?? 'LR', nodes, edges, containers: [] };
  if (m.lanes) ir.partitions = { lanes: bands('lanes', m.lanes), ...(m.phases && { phases: bands('phases', m.phases) }) };
  return ir;
}
