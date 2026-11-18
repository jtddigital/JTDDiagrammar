import type { Metaclass } from './model.ts';

/** A stereotype a profile defines: which metaclasses it may be applied to, and its tagged values. */
export interface StereotypeDef {
  name: string;
  extends: readonly Metaclass[];
  tags?: readonly string[];
}

/**
 * A UML profile (URS-PM-015). The base profile is Process; every platform profile extends it and nothing
 * else. A profile may add stereotypes, permission outcomes, a combination rule, the outcome for operations no
 * active state mentions, and workflow states. It may not change what a core construct means.
 */
export interface Profile {
  id: string;
  /** Always "process" for a platform profile; absent only on Process itself. */
  extends?: 'process';
  stereotypes: readonly StereotypeDef[];
  /** Permission outcomes added to the core ones (allowed, forbidden). */
  outcomes?: readonly string[];
  /** Combines the outcomes of the active states' entries; replaces the core rule. */
  combine?: (outcomes: readonly string[]) => string;
  /** Outcome when no active state has an entry for the operation. */
  noEntry?: string;
  /** Workflow states added to the standard ones. */
  workflowStates?: readonly string[];
}

export const CORE_OUTCOMES = ['allowed', 'forbidden'] as const;
/** The standard workflow state machine, defined once (URS-PM-012). */
export const WORKFLOW_STATES = ['Started', 'Running', 'Completed', 'Cancelled', 'Error'] as const;

/** Core combination over the active states: forbidden if any forbids, else allowed if any allows (URS-PM-009). */
export const coreCombine = (outcomes: readonly string[]): string | undefined =>
  outcomes.includes('forbidden') ? 'forbidden' : outcomes.includes('allowed') ? 'allowed' : undefined;

/** Process: the base profile (Permission, Rule, Subscription, Channel, workflow state). */
export const PROCESS: Profile = { id: 'process', stereotypes: [], noEntry: 'allowed' };

const st = (name: string, extendsWhat: readonly Metaclass[], tags?: readonly string[]): StereotypeDef => ({ name, extends: extendsWhat, ...(tags && { tags }) });
const TASK: Metaclass[] = ['CallOperationAction', 'OpaqueAction'];

/** SAP (ARCHITECTURE §13.7): status management, transaction control with warnings, workflows, release strategies, documents. */
export const SAP: Profile = {
  id: 'sap',
  extends: 'process',
  stereotypes: [
    st('SAP Object', ['Class'], ['objectType', 'statusProfile']),
    st('SAP System Status', ['State'], ['code']),
    st('SAP User Status', ['State'], ['code', 'number', 'low', 'high', 'flag']),
    st('SAP Business Transaction', ['Operation'], ['tcodes']),
    st('SAP Flexible Workflow', ['Activity']),
    st('SAP Workflow Step', TASK, ['deadline', 'optional', 'tcodes']),
    st('SAP Rework', TASK),
    st('SAP Release Strategy', ['Activity']),
    st('SAP Release Code', TASK, ['code', 'indicator', 'reject']),
    st('SAP Document', ['Class'], ['kind']),
  ],
  outcomes: ['warning'],
  // At least one active status must allow it and none may forbid it; a warning still lets it run.
  combine: (o) => (o.includes('forbidden') ? 'forbidden' : o.includes('warning') ? 'warning' : o.includes('allowed') ? 'allowed' : 'allowed'),
  // System statuses' own transaction control is SAP's and not modelled: no entry counts as allowed.
  noEntry: 'allowed',
};

/** Veeva Vault (ARCHITECTURE §13.7): object lifecycles, user actions, atomic security, workflows. */
export const VEEVA: Profile = {
  id: 'veeva',
  extends: 'process',
  stereotypes: [
    st('Veeva Object', ['Class'], ['apiName']),
    st('Veeva State', ['State'], ['stateType', 'stage']),
    st('Veeva User Action', ['Operation']),
    st('Veeva Workflow', ['Activity']),
    st('Veeva Task', TASK, ['fields', 'due', 'completion', 'signature']),
    st('Veeva Notification', ['SendSignalAction'], ['recipients']),
    st('Veeva System Action', TASK, ['fields']),
    st('Veeva Child Record', ['Class'], ['fields']),
  ],
  noEntry: 'allowed',
};

/** ServiceNow (ARCHITECTURE §13.7): records, state fields, UI actions, business rules, flows. */
export const SERVICENOW: Profile = {
  id: 'servicenow',
  extends: 'process',
  stereotypes: [
    st('ServiceNow Record', ['Class']),
    st('ServiceNow State', ['State']),
    st('ServiceNow UI Action', ['Operation']),
    st('ServiceNow Flow', ['Activity']),
  ],
  noEntry: 'allowed',
};

/** Profiles by id; a platform profile is accepted only when it extends Process and nothing else (URS-PM-015). */
export class Profiles {
  private readonly byId = new Map<string, Profile>([[PROCESS.id, PROCESS]]);

  register(p: Profile): this {
    if (p.id === PROCESS.id || this.byId.has(p.id)) throw new Error(`profile '${p.id}' is already registered`);
    if (p.extends !== 'process') throw new Error(`profile '${p.id}' must extend 'process' and nothing else`);
    const names = new Set<string>();
    for (const s of p.stereotypes) {
      if (names.has(s.name)) throw new Error(`profile '${p.id}' defines stereotype '${s.name}' twice`);
      names.add(s.name);
    }
    for (const o of p.outcomes ?? []) if ((CORE_OUTCOMES as readonly string[]).includes(o)) throw new Error(`profile '${p.id}' cannot redefine core outcome '${o}'`);
    this.byId.set(p.id, p);
    return this;
  }

  get(id: string): Profile | undefined {
    return this.byId.get(id);
  }

  /** The stereotype `name` of profile `id`, if defined. */
  stereotype(id: string, name: string): StereotypeDef | undefined {
    return this.byId.get(id)?.stereotypes.find((s) => s.name === name);
  }
}

/** The built-in profiles. */
export const profiles = () => new Profiles().register(SAP).register(VEEVA).register(SERVICENOW);
