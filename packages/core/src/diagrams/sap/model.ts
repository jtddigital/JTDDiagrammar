import type { Style, Theme } from '../../ir/types.ts';
import type { AnnotationOptions } from '../annotations.ts';

/** How a business transaction stands in a user status (SAP transaction control, URS-TYP-020). */
export const RULES = ['allowed', 'warning', 'forbidden'] as const;
export type Rule = (typeof RULES)[number];
/** What happens on rework, after the requester resubmits (SAP flexible workflow, URS-TYP-021). */
export const REWORK = ['repeat', 'continue', 'restart'] as const;

interface Annotated {
  /** Annotation: a numbered marker, the text in the notes beside the chart (URS-DM-029). */
  annotation?: string;
  /** Tags, e.g. for grouping annotations (URS-DM-030). */
  tags?: string[];
  quote?: string;
  style?: Style;
}

/** A system status, set only by business transactions, e.g. CRTD, REL, TECO, CLSD (URS-TYP-019). */
export interface SapSystemStatus extends Annotated {
  code: string;
  label?: string;
}

/**
 * A user status of the status profile (URS-TYP-019). With a `number` it is one of the sequence: only one is
 * active, and the next can be any numbered status from `low` to `high`. Without one it is a flag that can be
 * active alongside the others.
 */
export interface SapUserStatus extends Annotated {
  code: string;
  label?: string;
  number?: number;
  low?: number;
  high?: number;
  /** Set when the object is created. */
  initial?: boolean;
  /** The system status it is used in, which places it; default: the previous numbered status's. */
  system?: string;
  /** Authorization key: who may set or delete it. */
  auth?: string;
  /** Transaction control: each business transaction allowed, allowed with a warning, or forbidden while it is active (URS-TYP-020). */
  control?: Record<string, Rule>;
  /** Business transactions that set it, or delete it. */
  setBy?: string[];
  deletedBy?: string[];
}

/** A business transaction, e.g. Release; `sets` names the system statuses it sets (URS-TYP-019). */
export interface SapTransaction extends Annotated {
  id: string;
  label?: string;
  sets?: string[];
}

/** One approval step of a flexible workflow (URS-TYP-021). */
export interface SapStep extends Annotated {
  id: string;
  label?: string;
  /** Who approves, e.g. a role found by agent determination. */
  recipients?: string;
  /** Step conditions: the step runs only when they hold, else it is skipped. */
  conditions?: string[];
  deadline?: string;
  optional?: boolean;
  /** The approver can send it back to the requester; what follows the resubmission. */
  rework?: (typeof REWORK)[number];
  /** Status (code) the object is in during the step; default the workflow's trigger. */
  status?: string;
}

/** A flexible workflow: started by an event, its start conditions, then steps in order (URS-TYP-021). */
export interface SapWorkflow extends Annotated {
  id: string;
  label: string;
  /** What starts it: setting a status (code) raises an event. */
  trigger?: { status: string; event?: string };
  /** Start conditions: the workflow is used only when they hold. */
  conditions?: string[];
  steps: SapStep[];
  /** Status (code) set when it is released, or rejected. */
  released?: string;
  rejected?: string;
}

/** A release code of a release strategy: a release point, released after its prerequisites (URS-TYP-022). */
export interface SapReleaseCode extends Annotated {
  code: string;
  /** Who releases, e.g. "Purchasing manager". */
  label?: string;
  /** Codes that must release first; none: released straight away. */
  prerequisites?: string[];
  /** Release indicator once released, e.g. "2 – Released, changeable". */
  indicator?: string;
}

/** A classic release strategy, e.g. for purchase requisitions (URS-TYP-022). */
export interface SapReleaseStrategy extends Annotated {
  id: string;
  label: string;
  /** Document (id) it releases; a dashed arrow from it starts the strategy. */
  document?: string;
  /** Status (code) the object is in while it runs, which places it; default the document's. */
  status?: string;
  /** Release conditions (classification): the strategy applies only when they hold; else the document is released at once. */
  conditions?: string[];
  codes: SapReleaseCode[];
}

/** A document in the document flow, e.g. a purchase requisition created on release (URS-TYP-023). */
export interface SapDocument extends Annotated {
  id: string;
  label: string;
  /** Document type, e.g. "NB"; shown under the label. */
  kind?: string;
  /** Status (code) in which it is created: its column, and a dotted line from that status. */
  status?: string;
  /** Preceding documents (ids): an arrow from each. */
  from?: string[];
}

export interface Sap extends AnnotationOptions {
  version: string;
  type: 'sap';
  title?: string;
  theme?: Theme;
  /** Object, e.g. "Maintenance order (PM01)"; the title when there is none. */
  object?: string;
  /** Status profile, e.g. ZPMORD. */
  profile?: string;
  info?: Record<string, string>;
  systemStatuses?: SapSystemStatus[];
  userStatuses?: SapUserStatus[];
  transactions?: SapTransaction[];
  workflows?: SapWorkflow[];
  releaseStrategies?: SapReleaseStrategy[];
  documents?: SapDocument[];
  /** Draw transaction control as a matrix, one row per business transaction (URS-TYP-020). */
  matrix?: boolean;
  /** `arrows` (default) from each numbered status to those in its range, or `ranges`: the range written under it. */
  transitions?: 'arrows' | 'ranges';
  /** Start and step conditions go into annotations. */
  annotate?: boolean;
  legend?: boolean;
  styles?: Partial<Record<'systemStatuses' | 'userStatuses' | 'steps', Style>>;
  edgeStyle?: Style;
}

export const numbered = (m: Sap) => (m.userStatuses ?? []).filter((u) => u.number !== undefined).sort((a, b) => a.number! - b.number!);
export const flags = (m: Sap) => (m.userStatuses ?? []).filter((u) => u.number === undefined);
/** The numbered statuses a status may be followed by: those from its `low` to its `high`, other than itself. */
export const nextOf = (m: Sap, u: SapUserStatus) => numbered(m).filter((t) => t !== u && t.number! >= (u.low ?? u.number!) && t.number! <= (u.high ?? u.number!));
export const nameOf = (s: { code: string; label?: string }) => s.label ?? s.code;
