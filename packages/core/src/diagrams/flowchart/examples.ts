import type { Example } from '../../registry/diagram-type.ts';

export const examples: [Example, ...Example[]] = [
  {
    name: 'basic',
    title: 'Flowchart',
    description: 'A plain flowchart: nodes, each listing the nodes it connects `to`.',
    source: {
      version: '1',
      type: 'flowchart',
      title: 'Password reset',
      direction: 'TB',
      nodes: [
        { id: 'start', shape: 'terminator', label: 'Start', to: [{ node: 'request' }] },
        { id: 'request', label: 'Request reset link', to: [{ node: 'known' }] },
        { id: 'known', shape: 'decision', label: 'Email known?', to: [{ node: 'send', label: 'Yes' }, { node: 'end', label: 'No' }] },
        { id: 'send', label: 'Send link', to: [{ node: 'end' }] },
        { id: 'end', shape: 'terminator', label: 'End' },
      ],
    },
  },
  {
    name: 'cross-functional',
    title: 'Cross-functional flowchart',
    description: 'The same flowchart type with `lanes` (functions) and `phases`.',
    source: {
      version: '1',
      type: 'flowchart',
      title: 'Order fulfilment',
      direction: 'LR',
      lanes: [
        { id: 'customer', label: 'Customer' },
        { id: 'sales', label: 'Sales' },
        { id: 'warehouse', label: 'Warehouse' },
      ],
      phases: [
        { id: 'order', label: 'Order' },
        { id: 'fulfil', label: 'Fulfil' },
      ],
      nodes: [
        { id: 'start', shape: 'terminator', label: 'Start', lane: 'customer', phase: 'order', to: [{ node: 'place' }] },
        { id: 'place', label: 'Place order', lane: 'customer', phase: 'order', to: [{ node: 'stock' }] },
        { id: 'stock', shape: 'decision', label: 'In stock?', lane: 'sales', phase: 'order', to: [{ node: 'ship', label: 'Yes' }, { node: 'notify', label: 'No' }] },
        { id: 'ship', label: 'Ship order', lane: 'warehouse', phase: 'fulfil', to: [{ node: 'end' }] },
        { id: 'notify', label: 'Notify backorder', lane: 'sales', phase: 'fulfil', to: [{ node: 'end' }] },
        { id: 'end', shape: 'terminator', label: 'End', lane: 'customer', phase: 'fulfil' },
      ],
    },
  },
  {
    name: 'styled-callouts',
    title: 'Section styles and callout labels',
    description: 'Defaults per section in `styles` and for every connection in `edgeStyle`, overridden per item. Nodes keep a standard size; labels that do not fit go into callouts (`label: auto`).',
    source: {
      version: '1',
      type: 'flowchart',
      title: 'Expense claims',
      styles: {
        nodes: { label: 'auto', fill: '#eff6ff', stroke: '#1d4ed8' },
        lanes: { fill: '#f1f5f9' },
      },
      edgeStyle: { stroke: '#475569', arrowhead: 'open' },
      lanes: [
        { id: 'emp', label: 'Employee' },
        { id: 'mgr', label: 'Manager', style: { fill: '#fef3c7' } },
        { id: 'fin', label: 'Finance' },
      ],
      nodes: [
        { id: 'start', shape: 'terminator', label: 'Start', lane: 'emp', to: [{ node: 'submit' }] },
        { id: 'submit', label: 'Submit claim with receipts and a short business justification', lane: 'emp', to: [{ node: 'check' }] },
        {
          id: 'check',
          shape: 'decision',
          label: 'Within policy and budget for this quarter?',
          lane: 'mgr',
          to: [
            { node: 'pay', label: 'Yes', style: { stroke: '#15803d', labelFill: '#dcfce7' } },
            { node: 'return', label: 'No', style: { stroke: '#b91c1c', dash: 'dashed', arrowhead: 'diamond' } },
          ],
        },
        { id: 'return', label: 'Return for changes', lane: 'emp', style: { italic: true }, to: [{ node: 'submit', style: { opacity: 0.5 } }] },
        { id: 'pay', label: 'Reimburse within five working days', lane: 'fin', style: { bold: true, fill: '#dcfce7', stroke: '#15803d' }, to: [{ node: 'end', style: { arrowhead: 'circle', lineWidth: 2 } }] },
        { id: 'end', shape: 'terminator', label: 'End', lane: 'fin' },
      ],
    },
  },
];
