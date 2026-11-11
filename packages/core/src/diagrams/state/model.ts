import type { Direction, Style, Theme } from '../../ir/types.ts';

export const STATE_KINDS = ['state', 'initial', 'final', 'choice'] as const;
export type StateKind = (typeof STATE_KINDS)[number];

/** A state; with nested `states` it is a composite state (URS-TYP-004). */
export interface State {
  id: string;
  kind?: StateKind;
  label?: string;
  states?: State[];
  style?: Style;
}

/** UML-style transition, labelled `event [guard] / action` (URS-TYP-003). */
export interface Transition {
  id?: string;
  from: string;
  to: string;
  event?: string;
  guard?: string;
  action?: string;
  style?: Style;
}

export interface StateDiagram {
  version: string;
  type: 'state';
  title?: string;
  theme?: Theme;
  direction?: Direction;
  states: State[];
  transitions?: Transition[];
}

/** Depth-first walk with each state's JSON Pointer and parent id. */
export function* walk(states: readonly State[], base = '/states', parent?: string): Generator<{ state: State; path: string; parent?: string }> {
  for (const [i, s] of states.entries()) {
    yield { state: s, path: `${base}/${i}`, ...(parent !== undefined && { parent }) };
    if (s.states) yield* walk(s.states, `${base}/${i}/states`, s.id);
  }
}

export const isComposite = (s: State) => (s.states?.length ?? 0) > 0;

export const transitionLabel = (t: Transition): string | undefined =>
  [t.event, t.guard && `[${t.guard}]`, t.action && `/ ${t.action}`].filter(Boolean).join(' ') || undefined;
