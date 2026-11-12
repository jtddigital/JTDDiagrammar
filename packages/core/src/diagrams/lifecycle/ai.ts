import { byId, edgeMatcher, pick } from '../../ai-merge.ts';
import type { AiAssets } from '../../registry/diagram-type.ts';
import {
  COMPLETIONS,
  STATE_TYPES,
  STEP_KINDS,
  TRIGGERS,
  type LcAction,
  type LcLink,
  type LcSharedAction,
  type LcStage,
  type LcState,
  type LcStep,
  type LcVerdict,
  type LcWorkflow,
  type Lifecycle,
} from './model.ts';

const str = { type: 'string' } as const;
const strs = { type: 'array', items: str } as const;
const bool = { type: 'boolean' } as const;
const quote = { type: 'string', description: 'Short verbatim excerpt from the material supporting this item.' } as const;
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required, properties }) as const;
const by = { type: 'string', enum: ['user', 'job'], description: '"job" when a scheduled job makes the change.' } as const;

/** Flat for generation (URS-AI-004): steps name their workflow; connections, verdicts and user actions are from/to lists. */
const schema = obj(['title', 'stages', 'states', 'workflows', 'steps', 'connections', 'verdicts', 'userActions', 'sharedActions'], {
  title: str,
  stages: { type: 'array', description: 'Lifecycle stage groups, each over adjacent states.', items: obj(['id', 'label', 'states'], { id: str, label: str, states: strs }) },
  states: {
    type: 'array',
    description: 'Object states in lifecycle order.',
    items: obj(['id', 'label', 'stateType'], { id: str, label: str, stateType: { type: 'string', enum: STATE_TYPES }, entryCriteria: strs, entryActions: strs, quote }),
  },
  workflows: {
    type: 'array',
    items: obj(['id', 'label'], {
      id: str,
      label: str,
      start: obj(['state'], { state: { type: 'string', description: 'State the workflow is started in.' }, action: { type: 'string', description: 'User action that starts it.' }, by: { type: 'string', enum: TRIGGERS } }),
    }),
  },
  steps: {
    type: 'array',
    // Required with empty values for "not set": structured outputs allow at most 24 optional properties (URS-AI-004).
    items: obj(['id', 'workflow', 'kind', 'label', 'owner', 'state', 'target', 'fields', 'signature', 'due', 'completion'], {
      id: str,
      workflow: { type: 'string', description: 'Workflow id.' },
      kind: { type: 'string', enum: STEP_KINDS },
      label: { type: 'string', description: 'Empty for start, end, state changes and parallel bars to use the defaults.' },
      owner: { type: 'string', description: 'Role or group performing a task, or receiving a notification; empty if none.' },
      state: { type: 'string', description: 'State the record is in during the step; empty for state changes.' },
      target: { type: 'string', description: 'State changes only: the new state; empty otherwise.' },
      fields: { type: 'array', items: str, description: 'Task: fields to complete. System action: fields set, as "Field = value". Empty if none.' },
      signature: { type: 'boolean', description: 'Task needs an eSignature.' },
      due: { type: 'string', description: 'Task: time allowed, e.g. "5d"; empty if not stated.' },
      completion: { type: 'string', enum: [...COMPLETIONS, 'none'], description: 'Task with several participants; "none" otherwise.' },
      quote,
    }),
  },
  connections: { type: 'array', items: obj(['from', 'to'], { from: str, to: str, label: { type: 'string', description: 'Text on the connection, e.g. a decision outcome.' }, quote }) },
  verdicts: {
    type: 'array',
    description: 'Task outcomes, each leading to a step.',
    items: obj(['task', 'name', 'to', 'signature', 'reasons', 'comment'], { task: str, name: str, to: str, signature: bool, reasons: strs, comment: bool, quote }),
  },
  userActions: { type: 'array', items: obj(['from', 'to'], { from: str, to: str, label: { type: 'string', description: 'Action name.' }, by, after: { type: 'string', description: 'For a job: when, e.g. "2 years".' }, quote }) },
  sharedActions: {
    type: 'array',
    description: 'One user action available in several states, e.g. Cancel.',
    items: obj(['to', 'label'], { to: str, label: str, from: { ...strs, description: 'Source states; omit for every active state.' }, except: strs, quote }),
  },
});

type GLink = { from: string; to: string; label?: string; quote?: string };
interface G {
  title: string;
  stages: LcStage[];
  states: { id: string; label: string; stateType: LcState['stateType']; entryCriteria?: string[]; entryActions?: string[]; quote?: string }[];
  workflows: { id: string; label: string; start?: LcWorkflow['start'] }[];
  steps: (Omit<LcStep, 'to' | 'verdicts' | 'order' | 'style' | 'completion'> & { workflow: string; completion?: LcStep['completion'] | 'none' })[];
  connections: GLink[];
  verdicts: (Omit<LcVerdict, 'step' | 'labels' | 'exitSide' | 'entrySide' | 'main' | 'id' | 'style'> & { task: string; to: string })[];
  userActions: (GLink & Pick<LcAction, 'by' | 'after'>)[];
  sharedActions: { to: string; label: string; from?: string[]; except?: string[]; quote?: string }[];
}

const some = <T>(xs: T[] | undefined) => (xs?.length ? xs : undefined);
const text = <K extends string>(k: K, v: string | undefined) => (v ? ({ [k]: v } as Record<K, string>) : {});
const list = <K extends string, T>(k: K, v: T[] | undefined) => (v?.length ? ({ [k]: v } as Record<K, T[]>) : {});

/** Connections, verdicts and user actions as from/to pairs; only author-set ids are kept. */
const linksOf = (m: Lifecycle) => (m.workflows ?? []).flatMap((w) => w.steps.flatMap((s) => (s.to ?? []).map((l) => ({ ...l, from: s.id, to: l.step }))));
const verdictsOf = (m: Lifecycle) => (m.workflows ?? []).flatMap((w) => w.steps.flatMap((s) => (s.verdicts ?? []).map((v) => ({ ...v, task: s.id, to: v.step }))));
const actionsOf = (m: Lifecycle) => m.states.flatMap((s) => (s.to ?? []).map((a) => ({ ...a, from: s.id, to: a.state })));

const guide = `Diagram type: lifecycle (an object lifecycle, e.g. a Veeva Vault object).
- "states" are the object's lifecycle states in order. Exactly one has stateType "initial"; end states are "final"; a cancelled or withdrawn end state is "cancelled"; the rest "steady". Put entry criteria and entry actions on the state they belong to.
- "stages" group adjacent states into lifecycle stages; omit if the material names none.
- "workflows" are the named workflows; each step belongs to one. Set "start" when the material says which state (and user action, entry into the state, or scheduled job) starts it.
- Step kinds: "start" and "end"; "task" for work by a person or group (set "owner" to the role or group; "fields" for fields they complete; "signature", "due", "completion" when stated); "system" for automated actions such as setting field values or creating records (list them in "fields" as "Field = value"); "decision" only for a choice no task verdict makes; "notification" (owner = recipients); "stateChange" when the workflow moves the record to another state (set "target"; leave "state" and "label" empty); "parallel" and "join" where branches split and meet.
- Every step except a state change has the "state" the record is in while it happens.
- "verdicts" are a task's outcomes, each leading to the next step (e.g. Approve, Reject); prefer them to a decision after a task. "connections" link the other steps in order.
- "userActions" are state changes users (or scheduled jobs, by "job") make outside workflows, labelled with the action name. Use "sharedActions" for one action available in many states, such as Cancel.
- Where the material supports an item directly, set "quote" to a short verbatim excerpt (at most 20 words).`;

const examples = [
  {
    input:
      'A deviation starts in Draft; the owner submits it, which starts the investigation workflow and moves it to In Investigation. QA investigates and approves (eSignature) or rejects it back to Draft. Approval closes it. Users can cancel an open deviation.',
    output: {
      title: 'Deviation lifecycle',
      stages: [],
      states: [
        { id: 'draft', label: 'Draft', stateType: 'initial' },
        { id: 'investigation', label: 'In Investigation', stateType: 'steady' },
        { id: 'closed', label: 'Closed', stateType: 'final' },
        { id: 'cancelled', label: 'Cancelled', stateType: 'cancelled' },
      ],
      workflows: [{ id: 'handle', label: 'Deviation handling', start: { state: 'draft', action: 'Submit' } }],
      steps: [
        { id: 'start', workflow: 'handle', kind: 'start', label: '', owner: '', state: 'draft', target: '', fields: [], signature: false, due: '', completion: 'none' },
        { id: 'submit', workflow: 'handle', kind: 'stateChange', label: '', owner: '', state: '', target: 'investigation', fields: [], signature: false, due: '', completion: 'none' },
        { id: 'investigate', workflow: 'handle', kind: 'task', label: 'Investigate', owner: 'QA', state: 'investigation', target: '', fields: [], signature: false, due: '', completion: 'none' },
        { id: 'close', workflow: 'handle', kind: 'stateChange', label: '', owner: '', state: '', target: 'closed', fields: [], signature: false, due: '', completion: 'none' },
        { id: 'back', workflow: 'handle', kind: 'stateChange', label: '', owner: '', state: '', target: 'draft', fields: [], signature: false, due: '', completion: 'none' },
      ],
      connections: [
        { from: 'start', to: 'submit' },
        { from: 'submit', to: 'investigate' },
      ],
      verdicts: [
        { task: 'investigate', name: 'Approve', to: 'close', signature: true, reasons: [], comment: false },
        { task: 'investigate', name: 'Reject', to: 'back', signature: false, reasons: [], comment: false },
      ],
      userActions: [],
      sharedActions: [{ to: 'cancelled', label: 'Cancel' }],
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
    workflows: (m.workflows ?? []).map((w) => pick(w, 'id', 'label', 'start')),
    steps: (m.workflows ?? []).flatMap((w) =>
      w.steps.map((s) => ({
        id: s.id,
        workflow: w.id,
        kind: s.kind ?? 'task',
        label: s.label ?? '',
        owner: s.owner ?? '',
        state: s.state ?? '',
        target: s.target ?? '',
        fields: s.fields ?? [],
        signature: s.signature ?? false,
        due: s.due ?? '',
        completion: s.completion ?? 'none',
        ...pick(s, 'quote'),
      })),
    ),
    connections: linksOf(m).map((l) => pick(l, 'from', 'to', 'label', 'quote')),
    verdicts: verdictsOf(m).map((v) => ({ task: v.task, name: v.name, to: v.to, signature: v.signature ?? false, reasons: v.reasons ?? [], comment: v.comment ?? false, ...pick(v, 'quote') })),
    userActions: actionsOf(m).map((a) => pick(a, 'from', 'to', 'label', 'by', 'after', 'quote')),
    sharedActions: (m.sharedActions ?? []).map((a) => ({ to: a.state, label: a.label ?? '', ...pick(a, 'from', 'except', 'quote') })),
  }),
  // Steps from unknown workflows, and connections, verdicts or actions from unknown sources, are dropped.
  fromGenerated: (generated) => {
    const g = generated as G;
    const states: LcState[] = g.states.map((s) => {
      const to: LcAction[] = g.userActions
        .filter((a) => a.from === s.id)
        .map((a) => ({ state: a.to, ...text('label', a.label), ...(a.by === 'job' && { by: 'job' as const }), ...text('after', a.after), ...text('quote', a.quote) }));
      return {
        id: s.id,
        label: s.label,
        ...(s.stateType !== 'steady' && { stateType: s.stateType }),
        ...list('entryCriteria', s.entryCriteria),
        ...list('entryActions', s.entryActions),
        ...text('quote', s.quote),
        ...(to.length && { to }),
      };
    });
    const workflows: LcWorkflow[] = g.workflows.map((w) => ({
      id: w.id,
      label: w.label,
      ...(w.start && { start: w.start }),
      steps: g.steps
        .filter((s) => s.workflow === w.id)
        .map(({ workflow: _w, label, owner, state, target, due, quote: q, fields, signature, completion, ...s }) => {
          const to: LcLink[] = g.connections.filter((c) => c.from === s.id).map((c) => ({ step: c.to, ...text('label', c.label), ...text('quote', c.quote) }));
          const verdicts: LcVerdict[] = g.verdicts
            .filter((v) => v.task === s.id)
            .map(({ to: step, name, quote: vq, reasons, signature, comment }) => ({ name, step, ...(signature && { signature }), ...list('reasons', reasons), ...(comment && { comment }), ...text('quote', vq) }));
          return {
            ...s,
            ...text('label', label),
            ...text('owner', owner),
            ...text('state', state),
            ...text('target', target),
            ...list('fields', fields),
            ...(signature && { signature }),
            ...text('due', due),
            ...(completion && completion !== 'none' && { completion }),
            ...text('quote', q),
            ...(to.length && { to }),
            ...(verdicts.length && { verdicts }),
          };
        }),
    }));
    const sharedActions: LcSharedAction[] = g.sharedActions.map((a) => ({ state: a.to, ...text('label', a.label), ...list('from', some(a.from)), ...list('except', some(a.except)), ...text('quote', a.quote) }));
    return {
      version: '1',
      type: 'lifecycle',
      title: g.title,
      ...(g.stages.length && { stages: g.stages }),
      states,
      ...(sharedActions.length && { sharedActions }),
      ...(workflows.length && { workflows }),
    };
  },
  // Restore what generation cannot express: options, title block, security, styles, main path, order and side hints, author-set ids.
  merge: (prev, next) => {
    const [stages, states, workflows] = [byId(prev.stages ?? []), byId(prev.states), byId(prev.workflows ?? [])];
    const steps = byId((prev.workflows ?? []).flatMap((w) => w.steps));
    const link = edgeMatcher(linksOf(prev), (l) => l.label);
    const verdict = edgeMatcher(
      verdictsOf(prev).map((v) => ({ ...v, from: v.task })),
      (v) => v.name,
    );
    const action = edgeMatcher(actionsOf(prev), (a) => a.label);
    const shared = edgeMatcher(
      (prev.sharedActions ?? []).map((a) => ({ ...a, from: '', to: a.state })),
      (a) => a.label,
    );
    const linkLook = ['id', 'labels', 'exitSide', 'entrySide', 'main', 'style'] as const;
    return {
      ...next,
      ...pick(prev, 'theme', 'object', 'info', 'direction', 'statesAs', 'view', 'actionsLane', 'roleLanes', 'legend', 'styles', 'edgeStyle', 'styleBy'),
      ...(next.stages && { stages: next.stages.map((g) => ({ ...g, ...pick(stages.get(g.id) ?? ({} as LcStage), 'style') })) }),
      states: next.states.map((s) => ({
        ...s,
        ...pick(states.get(s.id) ?? ({} as LcState), 'security', 'style'),
        ...(s.to && { to: s.to.map((a) => ({ ...a, ...pick(action({ ...a, from: s.id, to: a.state }) ?? ({} as LcAction), 'id', 'labels', 'main', 'style') })) }),
      })),
      ...(next.sharedActions && { sharedActions: next.sharedActions.map((a) => ({ ...a, ...pick(shared({ ...a, from: '', to: a.state }) ?? ({} as LcSharedAction), 'id', 'labels', 'by', 'after', 'main', 'style') })) }),
      ...(next.workflows && {
        workflows: next.workflows.map((w) => ({
          ...w,
          ...pick(workflows.get(w.id) ?? ({} as LcWorkflow), 'roles', 'style'),
          steps: w.steps.map((s) => ({
            ...s,
            ...pick(steps.get(s.id) ?? ({} as LcStep), 'order', 'style'),
            ...(s.to && { to: s.to.map((l) => ({ ...l, ...pick(link({ ...l, from: s.id, to: l.step }) ?? ({} as LcLink), ...linkLook) })) }),
            ...(s.verdicts && { verdicts: s.verdicts.map((v) => ({ ...v, ...pick(verdict({ ...v, task: s.id, from: s.id, to: v.step }) ?? ({} as LcVerdict), ...linkLook) })) }),
          })),
        })),
      }),
    };
  },
};
