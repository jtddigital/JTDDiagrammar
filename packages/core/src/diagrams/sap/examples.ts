import type { Example } from '../../registry/diagram-type.ts';

/** A maintenance order with a user status profile and an approval workflow (URS-TYP-019..021). */
const order = {
  version: '1',
  type: 'sap',
  title: 'Maintenance order status and approval',
  object: 'Maintenance order (PM01)',
  profile: 'ZPMORD',
  systemStatuses: [
    { code: 'CRTD', label: 'Created' },
    { code: 'REL', label: 'Released' },
    { code: 'TECO', label: 'Technically completed' },
    { code: 'CLSD', label: 'Closed', annotation: 'No more postings, including costs; the order is locked for changes.', tags: ['Compliance'] },
  ],
  userStatuses: [
    { code: 'INIT', label: 'Initial', number: 10, low: 10, high: 20, initial: true, system: 'CRTD', auth: 'PLANNER', control: { release: 'forbidden' } },
    { code: 'APPR', label: 'Approved', number: 20, low: 10, high: 30, system: 'CRTD', auth: 'SUPERV', control: { release: 'allowed' } },
    { code: 'INWK', label: 'In work', number: 30, low: 30, high: 40, system: 'REL', setBy: ['release'], control: { confirm: 'allowed', teco: 'warning' } },
    { code: 'DONE', label: 'Work done', number: 40, low: 40, high: 40, system: 'REL', auth: 'PLANNER', control: { confirm: 'warning', teco: 'allowed' } },
    { code: 'HOLD', label: 'On hold', control: { release: 'forbidden', confirm: 'forbidden' }, deletedBy: ['teco'] },
  ],
  transactions: [
    { id: 'release', label: 'Release', sets: ['REL'] },
    { id: 'confirm', label: 'Enter confirmation' },
    { id: 'teco', label: 'Complete technically', sets: ['TECO'] },
    { id: 'close', label: 'Complete (business)', sets: ['CLSD'] },
  ],
  workflows: [
    {
      id: 'approval',
      label: 'Order approval',
      trigger: { status: 'INIT', event: 'Order created' },
      conditions: ['Estimated costs > 10,000 EUR'],
      tags: ['Cost control'],
      steps: [
        { id: 'planning', recipients: 'Maintenance planning manager', deadline: '2d', rework: 'repeat' },
        { id: 'plant', recipients: 'Plant manager', conditions: ['Estimated costs > 50,000 EUR'], deadline: '3d', tags: ['Cost control', 'Compliance'] },
      ],
      released: 'APPR',
    },
  ],
};

/** The same order's document flow, and the release strategy of the purchase requisition it creates (URS-TYP-022, URS-TYP-023). */
const { workflows: _approval, ...statuses } = order;
const flow = {
  ...statuses,
  title: 'Maintenance order document flow',
  documents: [
    { id: 'pr', label: 'Purchase requisition', kind: 'Non-stock components', status: 'REL' },
    { id: 'po', label: 'Purchase order', kind: 'NB', from: ['pr'] },
    { id: 'gr', label: 'Goods receipt', from: ['po'], annotation: 'Costs post to the order on goods receipt.' },
    { id: 'settle', label: 'Settlement document', status: 'TECO', from: ['gr'] },
  ],
  releaseStrategies: [
    {
      id: 'z1',
      label: 'Requisition release (Z1)',
      document: 'pr',
      conditions: ['Total value > 10,000 EUR', 'Plant 1000'],
      codes: [
        { code: 'P1', label: 'Purchasing manager', indicator: 'Blocked, changeable' },
        { code: 'F1', label: 'Finance controller', prerequisites: ['P1'], indicator: 'Released' },
        { code: 'Q1', label: 'Quality lead', prerequisites: ['P1'], indicator: 'Released' },
      ],
    },
  ],
};

export const examples: [Example, ...Example[]] = [
  {
    name: 'maintenance-order',
    title: 'SAP status and workflow',
    description:
      'System statuses set by business transactions over the user status profile: numbered statuses linked by their ranges, a flag, authorization keys. A flexible workflow started by an event, with start conditions, approval steps with recipients, deadlines and a step condition, rework, rejection, and the status set on release; an annotation and the legend.',
    source: order,
  },
  {
    name: 'transaction-control',
    title: 'SAP transaction control',
    description: '`matrix: true`: one row per business transaction, with a mark per user status: allowed, allowed with a warning, forbidden, sets or deletes the status. `annotate: true` puts the conditions into annotations, `annotationTarget: label` names what each is attached to, and `annotationGroups: [tag]` lists the notes by tag (one with two tags under both).',
    source: { ...order, title: 'Maintenance order transaction control', matrix: true, annotate: true, annotationTarget: 'label', annotationGroups: ['tag'] },
  },
  {
    name: 'document-flow',
    title: 'SAP document flow and release strategy',
    description:
      'The documents the order creates, each in the status it is created in and joined to it by a dotted line, with arrows from preceding to subsequent documents. The purchase requisition’s release strategy: release conditions as a gate, release codes released after their prerequisites (two in parallel), release indicators, and release at once when the conditions do not hold.',
    source: flow,
  },
];
