import type { Style, Theme } from '../../../ir/types.ts';
import type { AnnotationOptions } from '../../annotations.ts';
import type { Events } from '../events.ts';
import type { NodeKind } from '../model.ts';

/**
 * The generic `process` type (URS-PM-020): a process written directly in the canonical terms (ARCHITECTURE
 * §13), for platforms without a type of their own. Stereotypes are free unless `profile` names a registered one.
 */
interface Element {
  id: string;
  label?: string;
  /** Stereotype name, e.g. "Work Order"; checked against `profile` when one is named. */
  stereotype?: string;
  /** Tagged values of the stereotype. */
  values?: Record<string, string>;
  annotation?: string;
  tags?: string[];
  quote?: string;
  style?: Style;
}

export interface PrState extends Element {
  /** The region starts here. */
  initial?: boolean;
  /** Leaving it ends the region. */
  final?: boolean;
  /** Operations called on entry. */
  entry?: string[];
}

/** One independent dimension of the object's status: exactly one of its states is active. */
export interface PrRegion {
  id: string;
  label?: string;
  states: PrState[];
}

export interface PrOperation extends Element {
  /** Who calls it directly, outside workflows. */
  callers?: ('user' | 'job')[];
}

/** What fires a transition: exactly one of an operation call, a signal, a time (`after` or `at`) or a rule becoming true. */
export interface PrTrigger {
  call?: string;
  signal?: string;
  after?: string;
  at?: string;
  when?: string;
}

export interface PrTransition {
  id?: string;
  from: string;
  to: string;
  trigger?: PrTrigger;
  /** Rule id that must hold. */
  guard?: string;
  label?: string;
  quote?: string;
  style?: Style;
}

export interface PrPermission {
  state: string;
  operation: string;
  role?: string;
  /** `allowed`, `forbidden`, or an outcome the profile adds. */
  outcome: string;
}

export interface PrNode extends Element {
  kind: NodeKind;
  /** Who performs it (activity partition). */
  role?: string;
  /** Operations it calls. */
  calls?: string[];
  /** For `send`: the signal it publishes. */
  signal?: string;
}

export interface PrFlow {
  from: string;
  to: string;
  /** The outcome or rule (id) it is taken on. */
  guard?: string;
}

export interface PrWorkflow extends Element {
  label: string;
  nodes: PrNode[];
  flows: PrFlow[];
}

export interface ProcessDoc extends AnnotationOptions, Events {
  version: string;
  type: 'process';
  title?: string;
  theme?: Theme;
  /** A registered profile (e.g. `servicenow`) whose stereotypes and outcomes the chart uses; free stereotypes when absent. */
  profile?: string;
  object?: { label: string; stereotype?: string; values?: Record<string, string> };
  info?: Record<string, string>;
  regions: PrRegion[];
  operations?: PrOperation[];
  transitions?: PrTransition[];
  permissions?: PrPermission[];
  workflows?: PrWorkflow[];
  legend?: boolean;
  styles?: Partial<Record<'states' | 'tasks', Style>>;
}

export const triggerKinds = (t: PrTrigger) => (['call', 'signal', 'after', 'at', 'when'] as const).filter((k) => t[k] !== undefined);
export const statesOf = (m: ProcessDoc) => m.regions.flatMap((r) => r.states.map((s) => ({ state: s, region: r })));
export const nameOf = (e: { id: string; label?: string }) => e.label ?? e.id;
