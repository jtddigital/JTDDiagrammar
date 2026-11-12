import { pointer } from '../../diagnostics.ts';
import type { GraphIR, IREdge, IRNode } from '../../ir/types.ts';
import { over, styled } from '../section-styles.ts';
import { linksOf, type FlowBand, type Flowchart } from './model.ts';

const bands = (m: Flowchart, key: 'lanes' | 'phases', list: FlowBand[]) => list.map((b, i) => ({ ...b, ...styled(m.styles, key, b.style), src: pointer(key, i) }));

export function flowchartToIR(m: Flowchart): GraphIR {
  const nodes = m.nodes.map((n, i): IRNode => {
    const { shape = 'process', label = n.id, to: _to, ...rest } = n;
    return { ...rest, shape, label, ...styled(m.styles, 'nodes', n.style), src: pointer('nodes', i) };
  });
  const edges = linksOf(m).map((l): IREdge => {
    const ports = { ...(l.exitSide && { from: l.exitSide }), ...(l.entrySide && { to: l.entrySide }) };
    return {
      id: l.id,
      from: l.from,
      to: l.node,
      ...(l.label !== undefined && { label: l.label }),
      ...(Object.keys(ports).length && { ports }),
      ...over(m.edgeStyle, l.style),
      ...(l.quote && { quote: l.quote }),
      src: l.src,
    };
  });
  // Notes are nodes of their own, attached by a dotted, arrowless edge in their node's lane and phase.
  const owner = new Map(m.nodes.map((n) => [n.id, n]));
  (m.notes ?? []).forEach((note, i) => {
    const id = note.id ?? `note:${i}`;
    const target = note.for !== undefined ? owner.get(note.for) : undefined;
    const lane = note.lane ?? target?.lane;
    const phase = note.phase ?? target?.phase;
    nodes.push({ id, shape: 'note', label: note.text, ...(lane !== undefined && { lane }), ...(phase !== undefined && { phase }), ...styled(m.styles, 'notes', note.style), src: pointer('notes', i) });
    if (note.for !== undefined) edges.push({ id: `${id}:link`, from: note.for, to: id, marker: 'none', style: { dash: 'dotted' }, src: pointer('notes', i) });
  });
  const ir: GraphIR = { ...(m.title !== undefined && { title: m.title }), ...(m.theme && { theme: m.theme }), direction: m.direction ?? 'LR', nodes, edges, containers: [] };
  if (m.lanes) ir.partitions = { lanes: bands(m, 'lanes', m.lanes), ...(m.phases && { phases: bands(m, 'phases', m.phases) }) };
  return ir;
}
