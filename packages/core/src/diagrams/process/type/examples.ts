import type { Example } from '../../../registry/diagram-type.ts';

/** A Maximo work order: free stereotypes, two regions, call, time and signal triggers, a workflow (URS-PM-020). */
const workOrder = {
  version: '1',
  type: 'process',
  title: 'Work order',
  object: { label: 'Work order', stereotype: 'Maximo Object', values: { table: 'WORKORDER' } },
  info: { Platform: 'IBM Maximo' },
  rules: [{ id: 'large', text: 'Estimated cost > 25,000', via: 'script' }],
  regions: [
    {
      id: 'status',
      label: 'Status',
      states: [
        { id: 'WAPPR', label: 'Waiting on approval', initial: true },
        { id: 'APPR', label: 'Approved' },
        { id: 'INPRG', label: 'In progress' },
        { id: 'COMP', label: 'Completed', entry: ['charge'] },
        { id: 'CLOSE', label: 'Closed', final: true, annotation: 'Closed work orders cannot be changed; history is kept for audit.' },
        { id: 'CAN', label: 'Cancelled', final: true },
      ],
    },
    { id: 'hold', label: 'Hold', states: [{ id: 'free', label: 'Not on hold', initial: true }, { id: 'held', label: 'On hold' }] },
  ],
  operations: [
    { id: 'approve', label: 'Approve' },
    { id: 'start', label: 'Start work', callers: ['user'] },
    { id: 'complete', label: 'Complete', callers: ['user'] },
    { id: 'cancel', label: 'Cancel', callers: ['user'] },
    { id: 'hold', label: 'Put on hold', callers: ['user'] },
    { id: 'resume', label: 'Resume', callers: ['user'] },
    { id: 'charge', label: 'Post actual costs' },
  ],
  transitions: [
    { from: 'WAPPR', to: 'APPR', trigger: { call: 'approve' } },
    { from: 'APPR', to: 'INPRG', trigger: { call: 'start' } },
    { from: 'INPRG', to: 'COMP', trigger: { call: 'complete' } },
    { from: 'COMP', to: 'CLOSE', trigger: { after: '30d' } },
    { from: 'WAPPR', to: 'CAN', trigger: { call: 'cancel' } },
    { from: 'free', to: 'held', trigger: { call: 'hold' } },
    { from: 'held', to: 'free', trigger: { call: 'resume' } },
  ],
  permissions: [
    { state: 'held', operation: 'complete', outcome: 'forbidden' },
    { state: 'WAPPR', operation: 'start', outcome: 'forbidden' },
    { state: 'APPR', operation: 'cancel', role: 'Supervisor', outcome: 'allowed' },
  ],
  signals: [
    { id: 'created', label: 'Work order created', on: 'WAPPR', to: [{ workflow: 'approval' }] },
    { id: 'approved', label: 'Work order approved', to: [{ system: 'Scheduling', channel: 'MIF' }] },
  ],
  workflows: [
    {
      id: 'approval',
      label: 'Approval',
      stereotype: 'Maximo Workflow',
      nodes: [
        { id: 'start', kind: 'initial' },
        { id: 'size', kind: 'decision', label: 'Cost?' },
        { id: 'manager', kind: 'task', label: 'Approve', role: 'Maintenance manager', calls: ['approve'] },
        { id: 'auto', kind: 'task', label: 'Approve automatically', role: 'System', calls: ['approve'] },
        { id: 'merge', kind: 'merge' },
        { id: 'tell', kind: 'send', signal: 'approved' },
        { id: 'end', kind: 'final' },
      ],
      flows: [
        { from: 'start', to: 'size' },
        { from: 'size', to: 'manager', guard: 'large' },
        { from: 'size', to: 'auto', guard: 'Otherwise' },
        { from: 'manager', to: 'merge' },
        { from: 'auto', to: 'merge' },
        { from: 'merge', to: 'tell' },
        { from: 'tell', to: 'end' },
      ],
    },
  ],
};

/** A ServiceNow incident in the `servicenow` profile: its stereotypes are checked (URS-PM-015, URS-PM-020). */
const incident = {
  version: '1',
  type: 'process',
  title: 'Incident',
  profile: 'servicenow',
  object: { label: 'Incident', stereotype: 'ServiceNow Record', values: { table: 'incident' } },
  rules: [{ id: 'notes', text: 'Resolution notes filled in', via: 'script' }],
  regions: [
    {
      id: 'state',
      label: 'State',
      states: [
        { id: 'new', label: 'New', initial: true, stereotype: 'ServiceNow State', values: { value: '1' } },
        { id: 'progress', label: 'In Progress', stereotype: 'ServiceNow State', values: { value: '2' } },
        { id: 'hold', label: 'On Hold', stereotype: 'ServiceNow State', values: { value: '3' } },
        { id: 'resolved', label: 'Resolved', stereotype: 'ServiceNow State', values: { value: '6' } },
        { id: 'closed', label: 'Closed', final: true, stereotype: 'ServiceNow State', values: { value: '7' } },
      ],
    },
  ],
  operations: [
    { id: 'assign', label: 'Assign to me', callers: ['user'], stereotype: 'ServiceNow UI Action' },
    { id: 'pause', label: 'On hold', callers: ['user'], stereotype: 'ServiceNow UI Action' },
    { id: 'resume', label: 'Resume', callers: ['user'], stereotype: 'ServiceNow UI Action' },
    { id: 'resolve', label: 'Resolve', callers: ['user'], stereotype: 'ServiceNow UI Action' },
    { id: 'reopen', label: 'Reopen', callers: ['user'], stereotype: 'ServiceNow UI Action' },
  ],
  transitions: [
    { from: 'new', to: 'progress', trigger: { call: 'assign' } },
    { from: 'progress', to: 'hold', trigger: { call: 'pause' } },
    { from: 'hold', to: 'progress', trigger: { call: 'resume' } },
    { from: 'progress', to: 'resolved', trigger: { call: 'resolve' }, guard: 'notes' },
    { from: 'resolved', to: 'progress', trigger: { call: 'reopen' } },
    { from: 'resolved', to: 'closed', trigger: { after: '7d' } },
  ],
  permissions: [
    { state: 'progress', operation: 'resolve', role: 'itil', outcome: 'allowed' },
    { state: 'hold', operation: 'resolve', outcome: 'forbidden' },
  ],
  signals: [{ id: 'resolved', label: 'Incident resolved', on: 'resolved', to: [{ workflow: 'survey' }, { system: 'Customer portal', channel: 'REST' }] }],
  workflows: [
    {
      id: 'survey',
      label: 'Satisfaction survey',
      stereotype: 'ServiceNow Flow',
      nodes: [
        { id: 'start', kind: 'initial' },
        { id: 'send', kind: 'task', label: 'Send survey', role: 'System' },
        { id: 'end', kind: 'final' },
      ],
      flows: [
        { from: 'start', to: 'send' },
        { from: 'send', to: 'end' },
      ],
    },
  ],
};

/**
 * An SAP MDG change request in the `sap` profile (URS-TYP-028): change request statuses, actions, and the
 * rule-based workflow whose BRF+ single value decision table picks the next step and status from the
 * previous step and the action taken.
 */
const MDG = (code: string) => ({ stereotype: 'SAP MDG Status', values: { code } });
const ACTION = (code: string) => ({ callers: ['user' as const], stereotype: 'SAP MDG Action', values: { code } });
const STEP = (step: string, agent: string) => ({ stereotype: 'SAP MDG Step', values: { step, agent } });
const changeRequest = {
  version: '1',
  type: 'process',
  title: 'MDG material change request',
  profile: 'sap',
  object: { label: 'Change request (MAT01)', stereotype: 'SAP MDG Change Request', values: { crType: 'MAT01', entity: 'MATERIAL' } },
  info: { Workflow: 'Rule-based (WS60800086)' },
  rules: [
    { id: 'route', text: 'Single value decision table', via: 'BRF+' },
    { id: 'agents', text: 'User agent decision table', via: 'BRF+' },
  ],
  regions: [
    {
      id: 'status',
      label: 'Change request status',
      states: [
        { id: 's01', label: 'To be considered and approved', initial: true, ...MDG('01') },
        { id: 's02', label: 'Changes to be executed', ...MDG('02') },
        { id: 's03', label: 'To be revised', ...MDG('03') },
        { id: 's04', label: 'Final check to be performed', ...MDG('04') },
        { id: 's05', label: 'Final check approved', final: true, ...MDG('05') },
        { id: 's06', label: 'Final check rejected', final: true, ...MDG('06') },
      ],
    },
  ],
  operations: [
    { id: 'approve', label: 'Approve', ...ACTION('01') },
    { id: 'reject', label: 'Reject', ...ACTION('02') },
    { id: 'revise', label: 'Send for revision', ...ACTION('03') },
    { id: 'submit', label: 'Submit', ...ACTION('04') },
    { id: 'resubmit', label: 'Resubmit', ...ACTION('05') },
    { id: 'activate', label: 'Activate', stereotype: 'SAP MDG Action', values: { code: '06' } },
  ],
  transitions: [
    { from: 's01', to: 's02', trigger: { call: 'approve' }, guard: 'route' },
    { from: 's01', to: 's06', trigger: { call: 'reject' } },
    { from: 's02', to: 's04', trigger: { call: 'submit' }, guard: 'route' },
    { from: 's04', to: 's03', trigger: { call: 'revise' } },
    { from: 's03', to: 's04', trigger: { call: 'resubmit' } },
    { from: 's04', to: 's05', trigger: { call: 'activate' } },
    { from: 's04', to: 's06', trigger: { call: 'reject' } },
  ],
  permissions: [
    { state: 's04', operation: 'submit', outcome: 'forbidden' },
    { state: 's03', operation: 'approve', outcome: 'forbidden' },
  ],
  signals: [{ id: 'activated', label: 'Material activated', on: 's05', to: [{ system: 'Data replication (DRF)', channel: 'SOA / IDoc' }] }],
  workflows: [
    {
      id: 'rbwf',
      label: 'Rule-based workflow',
      stereotype: 'SAP MDG Workflow',
      values: { template: 'WS60800086' },
      nodes: [
        { id: 'start', kind: 'initial' },
        { id: 'approval', kind: 'task', label: 'Approve request', role: 'Data steward', calls: ['approve'], ...STEP('00', 'agents') },
        { id: 'process', kind: 'task', label: 'Process material', role: 'Material specialist', calls: ['submit'], ...STEP('01', 'agents') },
        { id: 'check', kind: 'task', label: 'Final check', role: 'Data steward', ...STEP('90', 'agents') },
        { id: 'verdict', kind: 'decision', label: 'Action?' },
        { id: 'revision', kind: 'task', label: 'Revise', role: 'Material specialist', calls: ['revise', 'resubmit'], ...STEP('95', 'agents') },
        { id: 'activation', kind: 'task', label: 'Activate', role: 'System', calls: ['activate'], ...STEP('91', 'non-user agent') },
        { id: 'rejection', kind: 'task', label: 'Reject', role: 'Data steward', calls: ['reject'], ...STEP('92', 'agents') },
        { id: 'end', kind: 'final' },
      ],
      flows: [
        { from: 'start', to: 'approval' },
        { from: 'approval', to: 'process', guard: 'route' },
        { from: 'process', to: 'check' },
        { from: 'check', to: 'verdict' },
        { from: 'verdict', to: 'activation', guard: 'Approve' },
        { from: 'verdict', to: 'revision', guard: 'Send for revision' },
        { from: 'verdict', to: 'rejection', guard: 'Reject' },
        { from: 'revision', to: 'check' },
        { from: 'activation', to: 'end' },
        { from: 'rejection', to: 'end' },
      ],
    },
  ],
};

export const examples: [Example, ...Example[]] = [
  {
    name: 'work-order',
    title: 'Process (generic)',
    description:
      'A platform without a type of its own (IBM Maximo), written in the canonical terms with free stereotypes. Two regions (status and hold, each one row with exactly one active state); transitions fired by operation calls and by time; permissions under each state; operations called on entry. A workflow with a decision on a named rule, a merge and a send node, started by the signal published when the order is created.',
    source: workOrder,
  },
  {
    name: 'incident',
    title: 'Process in a platform profile',
    description: '`profile: servicenow`: the stereotypes come from the ServiceNow profile and are checked against it. UI actions as operations with role permissions, a guard rule on Resolve, automatic closing after 7 days, and a signal that starts a flow and notifies a portal.',
    source: incident,
  },
  {
    name: 'mdg-change-request',
    title: 'SAP MDG change request',
    description:
      '`profile: sap` with the MDG stereotypes: a material change request’s statuses (01 to 06, two of them final), its actions as operations, and the rule-based workflow whose BRF+ decision tables (named rules) choose the next step and status from the previous step and action, and the agents. Activation publishes a signal for data replication.',
    source: changeRequest,
  },
];
