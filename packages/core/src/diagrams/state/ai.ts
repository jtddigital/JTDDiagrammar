import type { AiAssets } from '../../registry/diagram-type.ts';
import { STATE_KINDS, type State, type StateDiagram, type Transition } from './model.ts';

const str = { type: 'string' } as const;

/**
 * Structured outputs cannot express recursion (URS-AI-004), so states are generated flat with a
 * `parent` reference and nested by `fromGenerated`.
 */
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'direction', 'states', 'transitions'],
  properties: {
    title: str,
    direction: { type: 'string', enum: ['LR', 'TB'] },
    states: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'label'],
        properties: {
          id: { type: 'string', description: 'Short unique id: lowercase letters, digits, "_" or "-", starting with a letter.' },
          kind: { type: 'string', enum: STATE_KINDS },
          label: str,
          parent: { type: 'string', description: 'Id of the composite state this state is nested in; omit at top level.' },
        },
      },
    },
    transitions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: { from: str, to: str, event: str, guard: str, action: str },
      },
    },
  },
} as const;

interface Generated {
  title: string;
  direction: 'LR' | 'TB';
  states: { id: string; kind: State['kind']; label: string; parent?: string }[];
  transitions: Transition[];
}

/** Nest flat states by `parent`. Unknown or cyclic parents fall back to the top level. */
function nest(flat: Generated['states']): State[] {
  const byId = new Map(flat.map((s) => [s.id, s]));
  const reaches = (from: string | undefined, target: string): boolean => {
    for (let p = from, n = 0; p !== undefined && n <= flat.length; p = byId.get(p)?.parent, n++) if (p === target) return true;
    return false;
  };
  const parentOf = (s: Generated['states'][number]) => (s.parent && byId.has(s.parent) && !reaches(s.parent, s.id) ? s.parent : undefined);
  const build = (parent: string | undefined): State[] =>
    flat
      .filter((s) => parentOf(s) === parent)
      .map((s) => {
        const children = build(s.id);
        const kind = s.kind ?? 'state';
        return { id: s.id, ...(kind !== 'state' && { kind }), ...(s.label && { label: s.label }), ...(children.length && { states: children }) };
      });
  return build(undefined);
}

const guide = `Diagram type: state.
- One "state" per distinct condition the subject can be in; label states as conditions ("Waiting for payment"), not actions.
- Start each region with one "initial" pseudostate (empty label) that has exactly one outgoing transition; use "final" (empty label) for terminal ends and "choice" (empty label) for branching on guards.
- Group sub-states under a composite state by setting their "parent" to its id. A composite state is an ordinary "state" with children; it may have its own initial pseudostate.
- Transitions: "event" is what triggers them, "guard" is a condition without brackets, "action" is what happens, without a slash. Omit parts that the material does not mention.
- Use direction "LR" unless the material describes a long linear sequence.`;

const examples = [
  {
    input: 'An order is created as pending. Paying it makes it paid; if payment fails three times it is cancelled. A paid order is shipped, then delivered, which ends the process.',
    output: {
      title: 'Order lifecycle',
      direction: 'LR',
      states: [
        { id: 'start', kind: 'initial', label: '' },
        { id: 'pending', kind: 'state', label: 'Pending' },
        { id: 'paid', kind: 'state', label: 'Paid' },
        { id: 'cancelled', kind: 'state', label: 'Cancelled' },
        { id: 'shipped', kind: 'state', label: 'Shipped' },
        { id: 'end', kind: 'final', label: '' },
      ],
      transitions: [
        { from: 'start', to: 'pending' },
        { from: 'pending', to: 'paid', event: 'pay' },
        { from: 'pending', to: 'cancelled', event: 'payment failed', guard: 'attempts = 3' },
        { from: 'paid', to: 'shipped', event: 'ship' },
        { from: 'shipped', to: 'end', event: 'deliver' },
      ],
    },
  },
];

export const stateAi: AiAssets<StateDiagram> = {
  schema,
  guide,
  examples,
  fromGenerated: (generated) => {
    const g = generated as Generated;
    return { version: '1', type: 'state', title: g.title, direction: g.direction, states: nest(g.states), transitions: g.transitions };
  },
};
