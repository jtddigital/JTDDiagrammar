import type { EditAssets } from '../../registry/diagram-type.ts';
import type { State, StateDiagram } from './model.ts';

/** Where a state sits in the source, at any depth. */
function find(states: readonly State[], id: string, at = ''): { state: State; at: string } | undefined {
  for (const [i, s] of states.entries()) {
    const here = `${at}/states/${i}`;
    if (s.id === id) return { state: s, at: here };
    const inner = s.states && find(s.states, id, here);
    if (inner) return inner;
  }
  return undefined;
}

/** Toolbar editing (URS-EXT-012): states and pseudostates at the top level; transitions, never out of a final state or into an initial one. */
export const stateEdit: EditAssets<StateDiagram> = {
  add: [
    { label: 'State', make: (id) => ({ at: '/states', append: true, value: { id, label: 'New state' } }) },
    // One initial state per region (URS-TYP-005).
    { label: 'Initial', make: (id) => ({ at: '/states', append: true, value: { id, kind: 'initial' } }), available: (m) => !m.states.some((s) => s.kind === 'initial') },
    { label: 'Final', make: (id) => ({ at: '/states', append: true, value: { id, kind: 'final' } }) },
    { label: 'Choice', make: (id) => ({ at: '/states', append: true, value: { id, kind: 'choice' } }) },
  ],
  connect: (m, from, to) => {
    const a = find(m.states, from);
    const b = find(m.states, to);
    if (!a || !b || a.state.kind === 'final' || b.state.kind === 'initial') return undefined;
    return { at: `${a.at}/to`, append: true, value: { state: to } };
  },
};
