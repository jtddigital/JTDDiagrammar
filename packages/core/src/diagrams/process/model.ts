/**
 * The canonical process model (URS-PM-001..016, ARCHITECTURE §13): a named subset of UML. Each type here is
 * one allowlisted metaclass (§13.3), kept as small as the semantics need. Every element can carry a stereotype
 * from a profile, a JSON Pointer back to the source (`src`) and the name authors know it by (`name`), so
 * checks report in the platform's terms.
 */

/** A stereotype applied from a profile, with its tagged values (UML Stereotype). */
export interface Stereotype {
  profile: string;
  name: string;
  values?: Readonly<Record<string, unknown>>;
}

interface Element {
  id: string;
  /** The name authors know it by, e.g. "release code P1". */
  name: string;
  stereotype?: Stereotype;
  /** JSON Pointer into the platform source. */
  src?: string;
}

/** A business thing with an identity and behaviour (UML Class). */
export type PObject = Element;

/** Closed set of relation kinds (URS-PM-004): association, composition, dependency «derive» or «create». */
export const RELATION_KINDS = ['association', 'composition', 'derive', 'create'] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
export interface ObjectRelation extends Element {
  kind: RelationKind;
  from: string;
  to: string;
}

/** A state within one region (UML State); `entry` is its entry behaviour. */
export interface PState extends Element {
  entry?: Effect[];
}

/** One orthogonal dimension of an object's status (UML Region, URS-PM-005). */
export interface Region extends Element {
  /** Target of the region's initial pseudostate. */
  initial?: string;
  states: PState[];
}

/** What fires a transition (UML Trigger with Call/Signal/Time/ChangeEvent, URS-PM-006). */
export type Trigger =
  | { kind: 'call'; operation: string }
  | { kind: 'signal'; signal: string }
  | { kind: 'time'; after?: string; at?: string }
  | { kind: 'change'; rule: string };

/** What a transition or a state entry does (UML CallOperationAction / SendSignalAction). */
export type Effect = { kind: 'call'; operation: string; object?: string } | { kind: 'signal'; signal: string };

/** A move between two states of one region (UML Transition). `guard` names a rule. */
export interface Transition extends Element {
  region: string;
  from: string;
  to: string;
  trigger?: Trigger;
  guard?: string;
  effects?: Effect[];
}

/** One object's behaviour: its regions and the transitions between their states (UML StateMachine). */
export interface StateMachine {
  object: string;
  regions: Region[];
  transitions: Transition[];
}

/** Something invoked on an object (UML Operation): the hub between layers (URS-PM-007). */
export interface Operation extends Element {
  object: string;
  /** Who may call it directly, outside workflows, e.g. users (lifecycle user actions, SAP business transactions). */
  callers?: ('user' | 'job')[];
}

/** State × Operation [× Role] → outcome (Process profile «permits», URS-PM-009). */
export interface Permission {
  state: string;
  operation: string;
  role?: string;
  outcome: string;
  src?: string;
}

/** A named decision (UML Constraint, URS-PM-010); `via` records how it is evaluated. */
export interface Rule extends Element {
  text: string;
  via?: string;
}

/** A published fact, named in the past tense (UML Signal, URS-PM-014). */
export type Signal = Element;

/** Who a subscription delivers a signal to. */
export type Consumer =
  | { kind: 'workflow'; workflow: string }
  | { kind: 'operation'; operation: string }
  | { kind: 'handler'; name: string }
  | { kind: 'system'; name: string };

/** Delivery of a signal to one consumer through a channel (Process profile, URS-PM-014). */
export interface Subscription extends Element {
  signal: string;
  consumer: Consumer;
  /** e.g. "local", "event broker", "integration service". */
  channel?: string;
}

/** Workflow nodes (UML activity nodes, BPMN gateways and events; URS-PM-011). */
export const NODE_KINDS = ['initial', 'final', 'task', 'decision', 'merge', 'fork', 'join', 'send'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export interface WNode extends Element {
  kind: NodeKind;
  /** Role (activity partition) that performs it. */
  role?: string;
  /** Operations it calls (CallOperationAction). */
  calls?: { operation: string; object?: string }[];
  /** For `send`: the signal it publishes (SendSignalAction). */
  signal?: string;
}

/** A control flow; `guard` is an outcome or a rule id the flow is taken on. */
export interface Flow extends Element {
  from: string;
  to: string;
  guard?: string;
}

/** A workflow (UML Activity). */
export interface Workflow extends Element {
  nodes: WNode[];
  flows: Flow[];
}

/** A whole process model in one platform profile. */
export interface ProcessModel {
  /** The platform profile it uses; "process" for none. */
  profile: string;
  objects: PObject[];
  relations: ObjectRelation[];
  machines: StateMachine[];
  operations: Operation[];
  permissions: Permission[];
  rules: Rule[];
  signals: Signal[];
  subscriptions: Subscription[];
  workflows: Workflow[];
}

export const emptyModel = (profile: string): ProcessModel => ({
  profile,
  objects: [],
  relations: [],
  machines: [],
  operations: [],
  permissions: [],
  rules: [],
  signals: [],
  subscriptions: [],
  workflows: [],
});

/** The allowlisted UML metaclasses this model implements (URS-PM-001, ARCHITECTURE §13.3). */
export const METACLASSES = [
  'Class',
  'Property',
  'Association',
  'Dependency',
  'StateMachine',
  'Region',
  'State',
  'Pseudostate',
  'Transition',
  'Constraint',
  'Operation',
  'Trigger',
  'CallEvent',
  'SignalEvent',
  'TimeEvent',
  'ChangeEvent',
  'Signal',
  'Activity',
  'CallOperationAction',
  'SendSignalAction',
  'OpaqueAction',
  'ControlFlow',
  'DecisionNode',
  'MergeNode',
  'ForkNode',
  'JoinNode',
  'InitialNode',
  'ActivityFinalNode',
  'ActivityPartition',
  'Profile',
  'Stereotype',
] as const;
export type Metaclass = (typeof METACLASSES)[number];
