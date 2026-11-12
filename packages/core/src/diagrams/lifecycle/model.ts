import { pointer } from '../../diagnostics.ts';
import type { Direction, EdgeLabel, Side, Style, Theme } from '../../ir/types.ts';
import type { StyleBy } from '../section-styles.ts';

export const STEP_KINDS = ['start', 'task', 'decision', 'notification', 'system', 'stateChange', 'end'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export const STATE_TYPES = ['initial', 'steady', 'final'] as const;

/** A state change made by a user action, outside any workflow (URS-TYP-008). */
export interface LcAction {
  id?: string;
  /** Target state id. */
  state: string;
  label?: string;
  /** More labels, optionally pinned along the line (URS-DM-024). */
  labels?: EdgeLabel[];
  quote?: string;
  style?: Style;
}

/** An object lifecycle state: one column (or row) of the chart. */
export interface LcState {
  id: string;
  label?: string;
  stateType?: (typeof STATE_TYPES)[number];
  /** Shown as small text under the state's header (URS-DM-020). */
  entryCriteria?: string[];
  entryActions?: string[];
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
  quote?: string;
  style?: Style;
}

export interface LcStep {
  id: string;
  kind?: StepKind;
  label?: string;
  /** Who performs a step; shown under a divider (URS-DM-021) and matched by `styleBy.owner`. */
  owner?: string;
  /** State the record is in during this step; a state change defaults to its target. */
  state?: string;
  /** For `stateChange`: the state it moves the record to. */
  target?: string;
  order?: number;
  quote?: string;
  style?: Style;
  to?: LcLink[];
}

export interface LcWorkflow {
  id: string;
  label: string;
  style?: Style;
  steps: LcStep[];
}

export interface Lifecycle {
  version: string;
  type: 'lifecycle';
  title?: string;
  theme?: Theme;
  /** Object API name, e.g. `change_control__c`; shown in the title when there is no title. */
  object?: string;
  /** Flow direction inside the chart. */
  direction?: Direction;
  /** States as columns (default) or rows; workflows take the other axis. */
  statesAs?: 'columns' | 'rows';
  /** Show the lifecycle actions band; default: when any state has user actions. */
  actionsLane?: boolean;
  styles?: Partial<Record<'stages' | 'states' | 'workflows' | 'steps', Style>>;
  edgeStyle?: Style;
  /** Step styles by kind and by owner (URS-DM-023). */
  styleBy?: StyleBy<'kind' | 'owner'>;
  stages?: LcStage[];
  states: LcState[];
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

export const showActions = (m: Pick<Lifecycle, 'actionsLane' | 'states'>) => m.actionsLane ?? m.states.some((s) => (s.to?.length ?? 0) > 0);

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
