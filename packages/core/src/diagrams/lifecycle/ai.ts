import { byId, edgeMatcher, pick } from '../../ai-merge.ts';
import type { AiAssets } from '../../registry/diagram-type.ts';
import { STATE_TYPES, STEP_KINDS, type LcAction, type LcLink, type LcStage, type LcState, type LcStep, type LcWorkflow, type Lifecycle } from './model.ts';

const str = { type: 'string' } as const;
const strs = { type: 'array', items: str } as const;
const quote = { type: 'string', description: 'Short verbatim excerpt from the material supporting this item.' } as const;
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required, properties }) as const;
const pair = (label: string) => ({ type: 'array', items: obj(['from', 'to'], { from: str, to: str, label: { type: 'string', description: label }, quote }) }) as const;

/** Flat for generation (URS-AI-004): steps name their workflow; connections and user actions are from/to pairs. */
const schema = obj(['title', 'stages', 'states', 'workflows', 'steps', 'connections', 'userActions'], {
  title: str,
  stages: { type: 'array', description: 'Lifecycle stage groups, each over adjacent states.', items: obj(['id', 'label', 'states'], { id: str, label: str, states: strs }) },
  states: {
    type: 'array',
    description: 'Object states in lifecycle order.',
    items: obj(['id', 'label', 'stateType'], { id: str, label: str, stateType: { type: 'string', enum: STATE_TYPES }, entryCriteria: strs, entryActions: strs, quote }),
  },
  workflows: { type: 'array', items: obj(['id', 'label'], { id: str, label: str }) },
  steps: {
    type: 'array',
    items: obj(['id', 'workflow', 'kind', 'label'], {
      id: str,
      workflow: { type: 'string', description: 'Workflow id.' },
      kind: { type: 'string', enum: STEP_KINDS },
      label: { type: 'string', description: 'Empty for start, end and state changes to use the defaults.' },
      owner: str,
      state: { type: 'string', description: 'State the record is in during the step; omit for state changes.' },
      target: { type: 'string', description: 'State changes only: the new state.' },
      quote,
    }),
  },
  connections: pair('Text on the connection, e.g. a decision outcome.'),
  userActions: pair('Action name.'),
});

interface G {
  title: string;
  stages: LcStage[];
  states: { id: string; label: string; stateType: LcState['stateType']; entryCriteria?: string[]; entryActions?: string[]; quote?: string }[];
  workflows: { id: string; label: string }[];
  steps: (Omit<LcStep, 'to' | 'order' | 'style'> & { workflow: string })[];
  connections: { from: string; to: string; label?: string; quote?: string }[];
  userActions: { from: string; to: string; label?: string; quote?: string }[];
}

const some = <T>(xs: T[] | undefined) => (xs?.length ? xs : undefined);
const text = <K extends string>(k: K, v: string | undefined) => (v ? ({ [k]: v } as Record<K, string>) : {});

/** Steps flattened with their workflow, connections and user actions as from/to pairs; only author-set ids are kept. */
const linksOf = (m: Lifecycle) => (m.workflows ?? []).flatMap((w) => w.steps.flatMap((s) => (s.to ?? []).map((l) => ({ ...l, from: s.id, to: l.step }))));
const actionsOf = (m: Lifecycle) => m.states.flatMap((s) => (s.to ?? []).map((a) => ({ ...a, from: s.id, to: a.state })));

const guide = `Diagram type: lifecycle (an object lifecycle, e.g. a Veeva Vault object).
- "states" are the object's lifecycle states in order. Exactly one has stateType "initial"; end states are "final"; the rest "steady". Put entry criteria and entry actions on the state they belong to.
- "stages" group adjacent states into lifecycle stages; omit if the material names none.
- "workflows" are the named workflows; each step belongs to one. Kinds: "start" and "end"; "task" for work by a person or group (set "owner" to the role or group); "system" for automated actions such as setting field values or creating records; "decision" for a yes/no or outcome choice (label the outgoing connections with the outcome); "notification" for messages; "stateChange" when the workflow moves the record to another state (set "target"; leave "state" and "label" empty).
- Every non-stateChange step has the "state" the record is in while it happens.
- "connections" link steps in order. "userActions" are state changes users make outside workflows, labelled with the action name.
- Where the material supports an item directly, set "quote" to a short verbatim excerpt (at most 20 words).`;

const examples = [
  {
    input: 'A deviation starts in Draft. The owner submits it, which moves it to In Investigation; QA investigates and the record moves to Closed. Users can cancel a draft deviation.',
    output: {
      title: 'Deviation lifecycle',
      stages: [],
      states: [
        { id: 'draft', label: 'Draft', stateType: 'initial' },
        { id: 'investigation', label: 'In Investigation', stateType: 'steady' },
        { id: 'closed', label: 'Closed', stateType: 'final' },
        { id: 'cancelled', label: 'Cancelled', stateType: 'final' },
      ],
      workflows: [{ id: 'handle', label: 'Deviation handling' }],
      steps: [
        { id: 'start', workflow: 'handle', kind: 'start', label: '', state: 'draft' },
        { id: 'submit', workflow: 'handle', kind: 'stateChange', label: '', target: 'investigation' },
        { id: 'investigate', workflow: 'handle', kind: 'task', label: 'Investigate', owner: 'QA', state: 'investigation' },
        { id: 'close', workflow: 'handle', kind: 'stateChange', label: '', target: 'closed' },
      ],
      connections: [
        { from: 'start', to: 'submit' },
        { from: 'submit', to: 'investigate' },
        { from: 'investigate', to: 'close' },
      ],
      userActions: [{ from: 'draft', to: 'cancelled', label: 'Cancel' }],
    },
  },
];

export const lifecycleAi: AiAssets<Lifecycle> = {
  schema,
  guide,
  examples,
  toGenerated: (m) => ({
    title: m.title ?? m.object ?? '',
    stages: (m.stages ?? []).map((g) => pick(g, 'id', 'label', 'states')),
    states: m.states.map((s) => ({ id: s.id, label: s.label ?? s.id, stateType: s.stateType ?? 'steady', ...pick(s, 'entryCriteria', 'entryActions', 'quote') })),
    workflows: (m.workflows ?? []).map((w) => pick(w, 'id', 'label')),
    steps: (m.workflows ?? []).flatMap((w) => w.steps.map((s) => ({ id: s.id, workflow: w.id, kind: s.kind ?? 'task', label: s.label ?? '', ...pick(s, 'owner', 'state', 'target', 'quote') }))),
    connections: linksOf(m).map((l) => pick(l, 'from', 'to', 'label', 'quote')),
    userActions: actionsOf(m).map((a) => pick(a, 'from', 'to', 'label', 'quote')),
  }),
  // Steps from unknown workflows, and connections or actions from unknown sources, are dropped.
  fromGenerated: (generated) => {
    const g = generated as G;
    const states: LcState[] = g.states.map((s) => {
      const to: LcAction[] = g.userActions.filter((a) => a.from === s.id).map((a) => ({ state: a.to, ...text('label', a.label), ...text('quote', a.quote) }));
      return {
        id: s.id,
        label: s.label,
        ...(s.stateType !== 'steady' && { stateType: s.stateType }),
        ...(some(s.entryCriteria) && { entryCriteria: s.entryCriteria }),
        ...(some(s.entryActions) && { entryActions: s.entryActions }),
        ...text('quote', s.quote),
        ...(to.length && { to }),
      };
    });
    const workflows: LcWorkflow[] = g.workflows.map((w) => ({
      id: w.id,
      label: w.label,
      steps: g.steps
        .filter((s) => s.workflow === w.id)
        .map(({ workflow: _w, label, owner, state, target, quote: q, ...s }) => {
          const to: LcLink[] = g.connections.filter((c) => c.from === s.id).map((c) => ({ step: c.to, ...text('label', c.label), ...text('quote', c.quote) }));
          return { ...s, ...text('label', label), ...text('owner', owner), ...text('state', state), ...text('target', target), ...text('quote', q), ...(to.length && { to }) };
        }),
    }));
    return { version: '1', type: 'lifecycle', title: g.title, ...(g.stages.length && { stages: g.stages }), states, ...(workflows.length && { workflows }) };
  },
  // Restore what generation cannot express: layout options, styles, order hints, side hints and author-set ids.
  merge: (prev, next) => {
    const [stages, states, workflows] = [byId(prev.stages ?? []), byId(prev.states), byId(prev.workflows ?? [])];
    const steps = byId((prev.workflows ?? []).flatMap((w) => w.steps));
    const link = edgeMatcher(linksOf(prev), (l) => l.label);
    const action = edgeMatcher(actionsOf(prev), (a) => a.label);
    return {
      ...next,
      ...pick(prev, 'theme', 'object', 'direction', 'statesAs', 'actionsLane', 'styles', 'edgeStyle', 'styleBy'),
      ...(next.stages && { stages: next.stages.map((g) => ({ ...g, ...pick(stages.get(g.id) ?? ({} as LcStage), 'style') })) }),
      states: next.states.map((s) => ({
        ...s,
        ...pick(states.get(s.id) ?? ({} as LcState), 'style'),
        ...(s.to && { to: s.to.map((a) => ({ ...a, ...pick(action({ ...a, from: s.id, to: a.state }) ?? ({} as LcAction), 'id', 'labels', 'style') })) }),
      })),
      ...(next.workflows && {
        workflows: next.workflows.map((w) => ({
          ...w,
          ...pick(workflows.get(w.id) ?? ({} as LcWorkflow), 'style'),
          steps: w.steps.map((s) => ({
            ...s,
            ...pick(steps.get(s.id) ?? ({} as LcStep), 'order', 'style'),
            ...(s.to && { to: s.to.map((l) => ({ ...l, ...pick(link({ ...l, from: s.id, to: l.step }) ?? ({} as LcLink), 'id', 'labels', 'exitSide', 'entrySide', 'style') })) }),
          })),
        })),
      }),
    };
  },
};
