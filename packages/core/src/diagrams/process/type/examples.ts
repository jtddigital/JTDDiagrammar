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
];
