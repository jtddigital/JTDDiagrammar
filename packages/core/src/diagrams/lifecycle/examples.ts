import type { Example } from '../../registry/diagram-type.ts';

export const examples: [Example, ...Example[]] = [
  {
    name: 'change-control',
    title: 'Object lifecycle',
    description: 'States as columns grouped by lifecycle stage, workflows as rows, and the lifecycle actions band with user actions.',
    source: {
      version: '1',
      type: 'lifecycle',
      title: 'Change Control lifecycle',
      object: 'change_control__c',
      styleBy: { owner: { 'QA Reviewer': { fill: '#e0f2f1', stroke: '#00897b' }, 'Change Owner': { fill: '#fdecea', stroke: '#c62828' } } },
      stages: [
        { id: 'initiation', label: 'Initiation', states: ['draft', 'in_review'] },
        { id: 'execution', label: 'Execution', states: ['approved', 'in_progress'] },
        { id: 'closure', label: 'Closure', states: ['closed'] },
      ],
      states: [
        { id: 'draft', label: 'Draft', stateType: 'initial', to: [{ state: 'cancelled', label: 'Cancel' }] },
        { id: 'in_review', label: 'In Review', entryCriteria: ['Impact assessed'] },
        { id: 'approved', label: 'Approved', entryActions: ['Set approval date'], to: [{ state: 'in_progress', label: 'Start work' }] },
        { id: 'in_progress', label: 'In Progress' },
        { id: 'closed', label: 'Closed', stateType: 'final', entryActions: ['Lock record'] },
        { id: 'cancelled', label: 'Cancelled', stateType: 'final' },
      ],
      workflows: [
        {
          id: 'review',
          label: 'Review & Approval',
          steps: [
            { id: 'r_start', kind: 'start', state: 'draft', to: [{ step: 'r_submit' }] },
            { id: 'r_submit', kind: 'stateChange', target: 'in_review', to: [{ step: 'r_review' }] },
            { id: 'r_review', label: 'Review change', owner: 'QA Reviewer', state: 'in_review', to: [{ step: 'r_ok' }] },
            {
              id: 'r_ok',
              kind: 'decision',
              label: 'Approved?',
              state: 'in_review',
              to: [
                { step: 'r_approve', label: 'Yes' },
                { step: 'r_return', label: 'No' },
              ],
            },
            { id: 'r_approve', kind: 'stateChange', target: 'approved', to: [{ step: 'r_notify' }] },
            { id: 'r_notify', kind: 'notification', label: 'Notify owner', state: 'approved' },
            { id: 'r_return', kind: 'stateChange', target: 'draft' },
          ],
        },
        {
          id: 'closure',
          label: 'Closure',
          steps: [
            { id: 'c_start', kind: 'start', state: 'in_progress', to: [{ step: 'c_verify' }] },
            { id: 'c_verify', label: 'Verify effectiveness', owner: 'Change Owner', state: 'in_progress', to: [{ step: 'c_fields' }] },
            { id: 'c_fields', kind: 'system', label: 'Set closure date', state: 'in_progress', to: [{ step: 'c_close' }] },
            { id: 'c_close', kind: 'stateChange', target: 'closed', to: [{ step: 'c_end' }] },
            { id: 'c_end', kind: 'end', state: 'closed' },
          ],
        },
      ],
    },
  },
  {
    name: 'states-as-rows',
    title: 'Object lifecycle, states as rows',
    description: '`statesAs: rows` with `direction: TB`: states run down the page and workflows across it.',
    source: {
      version: '1',
      type: 'lifecycle',
      title: 'Controlled document',
      direction: 'TB',
      statesAs: 'rows',
      states: [
        { id: 'draft', label: 'Draft', stateType: 'initial' },
        { id: 'review', label: 'In Review' },
        { id: 'effective', label: 'Effective', entryActions: ['Publish to readers'] },
      ],
      workflows: [
        {
          id: 'approval',
          label: 'Approval',
          steps: [
            { id: 'a_start', kind: 'start', state: 'draft', to: [{ step: 'a_send' }] },
            { id: 'a_send', kind: 'stateChange', target: 'review', to: [{ step: 'a_sign' }] },
            { id: 'a_sign', label: 'Sign off', owner: 'Approver', state: 'review', to: [{ step: 'a_go' }] },
            { id: 'a_go', kind: 'stateChange', target: 'effective' },
          ],
        },
      ],
    },
  },
];
