import type { GraphIR, IRContainer, IRNode } from '../../ir/types.ts';
import { edgeLabels } from '../edge-labels.ts';
import { over, styled } from '../section-styles.ts';
import { isComposite, transitionLabel, transitionsOf, walk, type StateDiagram } from './model.ts';

const SHAPE = { state: 'state', initial: 'initial', final: 'final', choice: 'choice' } as const;

/** Composite states become containers; everything else nodes (URS-DM-013). */
export function stateToIR(m: StateDiagram): GraphIR {
  const nodes: IRNode[] = [];
  const containers: IRContainer[] = [];
  // Only composite states contain others; children of a pseudostate are reported by `state.nested`, not again here.
  const composite = new Set([...walk(m.states)].filter(({ state: s }) => (s.kind ?? 'state') === 'state' && isComposite(s)).map(({ state: s }) => s.id));
  for (const { state: s, path, parent } of walk(m.states)) {
    const p = { ...(parent !== undefined && composite.has(parent) && { parent }), ...styled(m.styles, 'states', s.style), ...(s.quote && { quote: s.quote }) };
    const kind = s.kind ?? 'state';
    if (kind === 'state' && isComposite(s)) containers.push({ id: s.id, label: s.label ?? s.id, ...p, src: path });
    else nodes.push({ id: s.id, shape: SHAPE[kind], label: kind === 'state' ? (s.label ?? s.id) : (s.label ?? ''), ...p, src: path });
  }
  const edges = transitionsOf(m.states).map((t) => {
    return { id: t.id, from: t.from, to: t.state, ...edgeLabels(transitionLabel(t), t.labels), ...over(m.transitionStyle, t.style), ...(t.quote && { quote: t.quote }), src: t.src };
  });
  return { ...(m.title !== undefined && { title: m.title }), ...(m.theme && { theme: m.theme }), direction: m.direction ?? 'LR', nodes, edges, containers };
}
