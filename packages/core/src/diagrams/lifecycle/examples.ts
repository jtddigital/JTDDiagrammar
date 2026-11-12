import type { Example } from '../../registry/diagram-type.ts';

/** A change control object: every lifecycle feature in one chart (URS-TYP-008, URS-TYP-009). */
const changeControl = {
  version: '1',
  type: 'lifecycle',
  title: 'Change Control lifecycle',
  object: 'change_control__c',
  info: { Lifecycle: 'Change Control', Version: '3' },
  styleBy: { owner: { 'QA Reviewer': { fill: '#e0f2f1', stroke: '#00897b' }, 'Change Owner': { fill: '#fdecea', stroke: '#c62828' } } },
  stages: [
    { id: 'initiation', label: 'Initiation', states: ['draft', 'in_review'] },
    { id: 'execution', label: 'Execution', states: ['approved', 'in_progress'] },
    { id: 'closure', label: 'Closure', states: ['closed', 'cancelled'] },
  ],
  states: [
    { id: 'draft', label: 'Draft', stateType: 'initial', security: { Owner: 'Edit', Viewer: 'Read' } },
    { id: 'in_review', label: 'In Review', entryCriteria: ['Impact assessed'], security: { Owner: 'Read', 'QA Reviewer': 'Edit' } },
    { id: 'approved', label: 'Approved', entryActions: ['Set approval date'], to: [{ state: 'in_progress', label: 'Start work', main: true }] },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'closed', label: 'Closed', stateType: 'final', entryActions: ['Lock record'] },
    { id: 'cancelled', label: 'Cancelled', stateType: 'cancelled' },
  ],
  sharedActions: [{ state: 'cancelled', label: 'Cancel', except: ['closed'] }],
  workflows: [
    {
      id: 'review',
      label: 'Review & Approval',
      start: { state: 'draft', action: 'Submit for review' },
      steps: [
        { id: 'r_start', kind: 'start', state: 'draft', to: [{ step: 'r_submit', main: true }] },
        { id: 'r_submit', kind: 'stateChange', target: 'in_review', to: [{ step: 'r_review', main: true }] },
        {
          id: 'r_review',
          label: 'Review change',
          owner: 'QA Reviewer',
          state: 'in_review',
          due: '5d',
          completion: 'all',
          fields: ['Risk level'],
          verdicts: [
            { name: 'Approve', step: 'r_approve', signature: true, main: true },
            { name: 'Reject', step: 'r_return', reasons: ['Incomplete', 'Out of scope'], comment: true },
          ],
        },
        { id: 'r_approve', kind: 'stateChange', target: 'approved', to: [{ step: 'r_notify', main: true }] },
        { id: 'r_notify', kind: 'notification', label: 'Notify owner', owner: 'Change Owner', state: 'approved' },
        { id: 'r_return', kind: 'stateChange', target: 'draft' },
      ],
    },
    {
      id: 'closure',
      label: 'Closure',
      start: { state: 'in_progress', by: 'entry' },
      steps: [
        { id: 'c_start', kind: 'start', state: 'in_progress', to: [{ step: 'c_split', main: true }] },
        { id: 'c_split', kind: 'parallel', state: 'in_progress', to: [{ step: 'c_verify', main: true }, { step: 'c_docs' }] },
        { id: 'c_verify', label: 'Verify effectiveness', owner: 'Change Owner', state: 'in_progress', signature: true, to: [{ step: 'c_join', main: true }] },
        { id: 'c_docs', label: 'Update documents', owner: 'Document Control', state: 'in_progress', to: [{ step: 'c_join' }] },
        { id: 'c_join', kind: 'join', state: 'in_progress', to: [{ step: 'c_fields', main: true }] },
        { id: 'c_fields', kind: 'system', label: 'Close record', fields: ['Closure date = today'], state: 'in_progress', to: [{ step: 'c_close', main: true }] },
        { id: 'c_close', kind: 'stateChange', target: 'closed', to: [{ step: 'c_end', main: true }] },
        { id: 'c_end', kind: 'end', state: 'closed' },
      ],
    },
  ],
};

export const examples: [Example, ...Example[]] = [
  {
    name: 'change-control',
    title: 'Object lifecycle',
    description:
      'States as columns grouped by lifecycle stage, workflows as rows. Task verdicts with eSignature, due time and participants; a parallel split and join; a system action setting fields; a shared Cancel action; what starts each workflow; the main path in bold; security, title block and legend.',
    source: changeControl,
  },
  {
    name: 'roles',
    title: 'Object lifecycle, workflows split by role',
    description: '`roleLanes: true`: each workflow is a group over one band per role, in the order owners appear; steps without an owner go in System.',
    source: { ...changeControl, roleLanes: true },
  },
  {
    name: 'summary',
    title: 'Object lifecycle, summary view',
    description: '`view: summary`: the states and every transition between them; each workflow collapses into dashed arrows.',
    source: { ...changeControl, view: 'summary' },
  },
  {
    name: 'states-as-rows',
    title: 'Object lifecycle, states as rows',
    description: '`statesAs: rows` with `direction: TB`: states run down the page and workflows across it. A scheduled job retires effective documents.',
    source: {
      version: '1',
      type: 'lifecycle',
      title: 'Controlled document',
      direction: 'TB',
      statesAs: 'rows',
      states: [
        { id: 'draft', label: 'Draft', stateType: 'initial' },
        { id: 'review', label: 'In Review' },
        { id: 'effective', label: 'Effective', entryActions: ['Publish to readers'], to: [{ state: 'retired', label: 'Retire', by: 'job', after: '2 years' }] },
        { id: 'retired', label: 'Retired', stateType: 'final' },
      ],
      workflows: [
        {
          id: 'approval',
          label: 'Approval',
          steps: [
            { id: 'a_start', kind: 'start', state: 'draft', to: [{ step: 'a_send' }] },
            { id: 'a_send', kind: 'stateChange', target: 'review', to: [{ step: 'a_sign' }] },
            { id: 'a_sign', label: 'Sign off', owner: 'Approver', state: 'review', verdicts: [{ name: 'Approve', step: 'a_go', signature: true }, { name: 'Reject', step: 'a_back' }] },
            { id: 'a_go', kind: 'stateChange', target: 'effective' },
            { id: 'a_back', kind: 'stateChange', target: 'draft' },
          ],
        },
      ],
    },
  },
];
