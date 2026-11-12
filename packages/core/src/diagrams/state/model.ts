import type { Direction, Style, Theme } from '../../ir/types.ts';

export const STATE_KINDS = ['state', 'initial', 'final', 'choice'] as const;
export type StateKind = (typeof STATE_KINDS)[number];

/** A state; with nested `states` it is a composite state (URS-TYP-004). */
export interface State {
  id: string;
  kind?: StateKind;
  label?: string;
  states?: State[];
  quote?: string;
  style?: Style;
  /** Outgoing transitions (URS-IN-009). */
  to?: StateLink[];
}

/** UML-style transition from the state it is nested under, labelled `event [guard] / action` (URS-TYP-003, URS-IN-009). */
export interface StateLink {
  id?: string;
  /** Target state id. */
  state: string;
  event?: string;
  guard?: string;
  action?: string;
  quote?: string;
  style?: Style;
}

export interface StateDiagram {
  version: string;
  type: 'state';
  title?: string;
  theme?: Theme;
  /** Default style for every state (URS-DM-015). */
  styles?: Partial<Record<'states', Style>>;
  /** Default style for every transition; each one's `style` overrides it (URS-DM-015). */
  transitionStyle?: Style;
  direction?: Direction;
  states: State[];
}

/** A transition with its source, generated id and JSON Pointer. */
export interface Transition extends StateLink {
  id: string;
  from: string;
  src: string;
}

/** Depth-first walk with each state's JSON Pointer and parent id. */
export function* walk(states: readonly State[], base = '/states', parent?: string): Generator<{ state: State; path: string; parent?: string }> {
  for (const [i, s] of states.entries()) {
    yield { state: s, path: `${base}/${i}`, ...(parent !== undefined && { parent }) };
    if (s.states) yield* walk(s.states, `${base}/${i}/states`, s.id);
  }
}

export const isComposite = (s: State) => (s.states?.length ?? 0) > 0;

/** Every transition in source order. Generated ids contain ':' so they cannot collide with user ids. */
export const transitionsOf = (states: readonly State[]): Transition[] =>
  [...walk(states)].flatMap(({ state: s, path }) => (s.to ?? []).map((l, j) => ({ ...l, id: l.id ?? `edge:${s.id}:${j}`, from: s.id, src: `${path}/to/${j}` })));

export const transitionLabel = (t: StateLink): string | undefined =>
  [t.event, t.guard && `[${t.guard}]`, t.action && `/ ${t.action}`].filter(Boolean).join(' ') || undefined;
