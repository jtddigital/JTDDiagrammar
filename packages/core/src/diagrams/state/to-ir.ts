import { pointer } from '../../diagnostics.ts';
import type { GraphIR, IRContainer, IRNode } from '../../ir/types.ts';
import { isComposite, transitionLabel, walk, type StateDiagram } from './model.ts';

const SHAPE = { state: 'state', initial: 'initial', final: 'final', choice: 'choice' } as const;

/** Composite states become containers; everything else nodes (URS-DM-013). */
export function stateToIR(m: StateDiagram): GraphIR {
  const nodes: IRNode[] = [];
  const containers: IRContainer[] = [];
  // Only composite states contain others; children of a pseudostate are reported by `state.nested`, not again here.
  const composite = new Set([...walk(m.states)].filter(({ state: s }) => (s.kind ?? 'state') === 'state' && isComposite(s)).map(({ state: s }) => s.id));
  for (const { state: s, path, parent } of walk(m.states)) {
    const p = { ...(parent !== undefined && composite.has(parent) && { parent }), ...(s.style && { style: s.style }) };
    const kind = s.kind ?? 'state';
    if (kind === 'state' && isComposite(s)) containers.push({ id: s.id, label: s.label ?? s.id, ...p, src: path });
    else nodes.push({ id: s.id, shape: SHAPE[kind], label: kind === 'state' ? (s.label ?? s.id) : (s.label ?? ''), ...p, src: path });
  }
  const edges = (m.transitions ?? []).map((t, i) => {
    const label = transitionLabel(t);
    return { id: t.id ?? `edge:${i}`, from: t.from, to: t.to, ...(label !== undefined && { label }), ...(t.style && { style: t.style }), src: pointer('transitions', i) };
  });
  return { ...(m.title !== undefined && { title: m.title }), ...(m.theme && { theme: m.theme }), direction: m.direction ?? 'LR', nodes, edges, containers };
}
