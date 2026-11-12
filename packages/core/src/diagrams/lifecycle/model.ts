import { pointer } from '../../diagnostics.ts';
import type { Direction, EdgeLabel, Side, Style, Theme } from '../../ir/types.ts';
import type { StyleBy } from '../section-styles.ts';

export const STEP_KINDS = ['start', 'task', 'decision', 'notification', 'system', 'stateChange', 'parallel', 'join', 'end'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const STATE_TYPES = ['initial', 'steady', 'final', 'cancelled'] as const;
export type StateType = (typeof STATE_TYPES)[number];
/** How a task with several participants completes: all of them, any one, or one task each. */
export const COMPLETIONS = ['all', 'any', 'each'] as const;
/** What starts a workflow: a user action, entering the state, or a scheduled job. */
export const TRIGGERS = ['user', 'entry', 'job'] as const;

/** A state change made by a user action (or a scheduled job), outside any workflow (URS-TYP-008, URS-TYP-009). */
export interface LcAction {
  id?: string;
  /** Target state id. */
  state: string;
  label?: string;
  /** More labels, optionally pinned along the line (URS-DM-024). */
  labels?: EdgeLabel[];
  /** `job`: a scheduled job makes the change, `after` this long (e.g. "2 years"). */
  by?: 'user' | 'job';
  after?: string;
  /** On the main path. */
  main?: boolean;
  quote?: string;
  style?: Style;
}

/** One user action available in several states, drawn once (URS-TYP-009). */
export interface LcSharedAction extends LcAction {
  /** Source states; default every state that is not final or cancelled. */
  from?: string[];
  except?: string[];
}

/** An object lifecycle state: one column (or row) of the chart. */
export interface LcState {
  id: string;
  label?: string;
  stateType?: StateType;
  /** Shown as small text under the state's header (URS-DM-020). */
  entryCriteria?: string[];
  entryActions?: string[];
  /** Access per role in this state, e.g. `{ "Owner": "Edit" }`; shown under the header. */
  security?: Record<string, string>;
  quote?: string;
  style?: Style;
  /** User actions leaving this state. */
  to?: LcAction[];
}

/** Lifecycle stage group: a header over adjacent states (URS-DM-019). */
export interface LcStage {
  id: string;
  label: string;
  states: string[];
  style?: Style;
}

export interface LcLink {
  id?: string;
  /** Target step id. */
  step: string;
  label?: string;
  /** More labels, optionally pinned along the line (URS-DM-024). */
  labels?: EdgeLabel[];
  exitSide?: Side;
  entrySide?: Side;
  /** On the main path. */
  main?: boolean;
  quote?: string;
  style?: Style;
}

/** A task verdict: a named outcome that leads to the next step (URS-TYP-009). */
export interface LcVerdict extends Omit<LcLink, 'label'> {
  name: string;
  /** Choosing it needs an eSignature. */
  signature?: boolean;
  /** Reasons offered, and whether a comment is required; shown in the tooltip. */
  reasons?: string[];
  comment?: boolean;
}

export interface LcStep {
  id: string;
  kind?: StepKind;
  label?: string;
  /** Who performs the step (for a notification, who receives it); shown under a divider (URS-DM-021), matched by `styleBy.owner`. */
  owner?: string;
  /** State the record is in during this step; a state change defaults to its target. */
  state?: string;
  /** For `stateChange`: the state it moves the record to. */
  target?: string;
  /** Task: fields the participant completes. System action: fields it sets, e.g. "Approval date = today". */
  fields?: string[];
  /** Task: outcomes, each leading on. */
  verdicts?: LcVerdict[];
  /** Task: an eSignature is required. */
  signature?: boolean;
  /** Task: time allowed, e.g. "5d". */
  due?: string;
  /** Task with several participants. */
  completion?: (typeof COMPLETIONS)[number];
  order?: number;
  quote?: string;
  style?: Style;
  to?: LcLink[];
}

export interface LcWorkflow {
  id: string;
  label: string;
  style?: Style;
  /** Role bands in order, with `roleLanes`; owners not listed follow in order of appearance (URS-TYP-010). */
  roles?: string[];
  /** What starts it, from which state (URS-TYP-009). */
  start?: { state: string; action?: string; by?: (typeof TRIGGERS)[number] };
  steps: LcStep[];
}

export interface Lifecycle {
  version: string;
  type: 'lifecycle';
  title?: string;
  theme?: Theme;
  /** Object API name, e.g. `change_control__c`; shown in the title when there is no title. */
  object?: string;
  /** Title block, e.g. `{ "Version": "3" }` (URS-DM-027). */
  info?: Record<string, string>;
  /** Flow direction inside the chart. */
  direction?: Direction;
  /** States as columns (default) or rows; workflows take the other axis. */
  statesAs?: 'columns' | 'rows';
  /** `summary`: the states and the transitions between them; workflows collapse into arrows (URS-TYP-009). */
  view?: 'detailed' | 'summary';
  /** Show the lifecycle actions band; default: when there are user actions or workflow starts to show. */
  actionsLane?: boolean;
  /** One band per role (step owner) inside each workflow (URS-TYP-010). */
  roleLanes?: boolean;
  /** Legend of the shapes, colours and markers used; default on (URS-DM-026). */
  legend?: boolean;
  styles?: Partial<Record<'stages' | 'states' | 'workflows' | 'steps', Style>>;
  edgeStyle?: Style;
  /** Step styles by kind and owner, state styles by type (URS-DM-023). */
  styleBy?: StyleBy<'kind' | 'owner' | 'stateType'>;
  stages?: LcStage[];
  states: LcState[];
  /** User actions available in several states, each drawn once. */
  sharedActions?: LcSharedAction[];
  workflows?: LcWorkflow[];
}

export const ACTIONS_BAND = 'lifecycle:actions';
export const pill = (state: string) => `state:${state}`;

/** Every step with its workflow and JSON Pointer. */
export const stepsOf = (m: Pick<Lifecycle, 'workflows'>) =>
  (m.workflows ?? []).flatMap((w, wi) => w.steps.map((s, si) => ({ step: s, workflow: w, src: pointer('workflows', wi, 'steps', si) })));

/** The state a step sits in: its own, or for a state change its target. */
export const stateOf = (s: LcStep) => s.state ?? (s.kind === 'stateChange' ? s.target : undefined);

/** Whether states map to phases (the flow axis) rather than lanes, for this direction and orientation. */
export const statesArePhases = (m: Pick<Lifecycle, 'direction' | 'statesAs'>) => ((m.statesAs ?? 'columns') === 'columns') === ((m.direction ?? 'LR') === 'LR');

export const showActions = (m: Pick<Lifecycle, 'actionsLane' | 'states' | 'sharedActions' | 'workflows' | 'view'>) =>
  m.view === 'summary' || (m.actionsLane ?? (m.states.some((s) => (s.to?.length ?? 0) > 0) || !!m.sharedActions?.length || !!m.workflows?.some((w) => w.start)));

/** Where a step leads: plain connections, then verdicts. */
export const nextOf = (s: LcStep): string[] => [...(s.to ?? []).map((l) => l.step), ...(s.verdicts ?? []).map((v) => v.step)];

/** Final and cancelled states end the lifecycle. */
export const ends = (t: StateType | undefined) => t === 'final' || t === 'cancelled';

/** Source states of a shared action. */
export const sharedFrom = (m: Pick<Lifecycle, 'states'>, a: LcSharedAction): string[] =>
  (a.from ?? m.states.filter((s) => !ends(s.stateType)).map((s) => s.id)).filter((id) => id !== a.state && !(a.except ?? []).includes(id));

/** State-to-state transitions: user actions, shared actions, and workflow state changes (from the state of each step leading into them). */
export function transitions(m: Lifecycle): { from: string; to: string; workflow?: LcWorkflow }[] {
  const out: { from: string; to: string; workflow?: LcWorkflow }[] = [];
  for (const s of m.states) for (const a of s.to ?? []) out.push({ from: s.id, to: a.state });
  for (const a of m.sharedActions ?? []) for (const f of sharedFrom(m, a)) out.push({ from: f, to: a.state });
  for (const w of m.workflows ?? []) {
    const byId = new Map(w.steps.map((s) => [s.id, s]));
    for (const p of w.steps)
      for (const n of nextOf(p)) {
        const t = byId.get(n);
        const from = stateOf(p);
        if (t?.kind === 'stateChange' && t.target !== undefined && from !== undefined && from !== t.target) out.push({ from, to: t.target, workflow: w });
      }
  }
  return out;
}

/** Stage ids whose states are unknown, shared or not adjacent; reported by the rules and left out of the IR. */
export function badStages(m: Pick<Lifecycle, 'stages' | 'states'>): Map<string, string> {
  const order = m.states.map((s) => s.id);
  const owner = new Map<string, string>();
  const bad = new Map<string, string>();
  for (const g of m.stages ?? []) {
    const idx = g.states.map((id) => order.indexOf(id));
    const unknown = g.states.find((_, k) => idx[k]! < 0);
    const shared = g.states.find((id) => owner.has(id));
    if (unknown !== undefined) bad.set(g.id, `stage '${g.id}' references unknown state '${unknown}'`);
    else if (shared !== undefined) bad.set(g.id, `state '${shared}' is in stages '${owner.get(shared)}' and '${g.id}'`);
    else if (idx.some((v, k) => k > 0 && v !== idx[k - 1]! + 1)) bad.set(g.id, `stage '${g.id}' must list adjacent states, in lifecycle order`);
    g.states.forEach((id) => owner.has(id) || owner.set(id, g.id));
  }
  return bad;
}
