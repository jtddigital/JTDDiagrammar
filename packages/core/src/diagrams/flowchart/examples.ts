import type { Example } from '../../registry/diagram-type.ts';

export const examples: [Example, ...Example[]] = [
  {
    name: 'basic',
    title: 'Flowchart',
    description: 'A plain flowchart: nodes and directed edges.',
    source: {
      version: '1',
      type: 'flowchart',
      title: 'Password reset',
      direction: 'TB',
      nodes: [
        { id: 'start', shape: 'terminator', label: 'Start' },
        { id: 'request', label: 'Request reset link' },
        { id: 'known', shape: 'decision', label: 'Email known?' },
        { id: 'send', label: 'Send link' },
        { id: 'end', shape: 'terminator', label: 'End' },
      ],
      edges: [
        { from: 'start', to: 'request' },
        { from: 'request', to: 'known' },
        { from: 'known', to: 'send', label: 'Yes' },
        { from: 'known', to: 'end', label: 'No' },
        { from: 'send', to: 'end' },
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
        { id: 'start', shape: 'terminator', label: 'Start', lane: 'customer', phase: 'order' },
        { id: 'place', label: 'Place order', lane: 'customer', phase: 'order' },
        { id: 'stock', shape: 'decision', label: 'In stock?', lane: 'sales', phase: 'order' },
        { id: 'ship', label: 'Ship order', lane: 'warehouse', phase: 'fulfil' },
        { id: 'notify', label: 'Notify backorder', lane: 'sales', phase: 'fulfil' },
        { id: 'end', shape: 'terminator', label: 'End', lane: 'customer', phase: 'fulfil' },
      ],
      edges: [
        { from: 'start', to: 'place' },
        { from: 'place', to: 'stock' },
        { from: 'stock', to: 'ship', label: 'Yes' },
        { from: 'stock', to: 'notify', label: 'No' },
        { from: 'ship', to: 'end' },
        { from: 'notify', to: 'end' },
      ],
    },
  },
  {
    name: 'styled-callouts',
    title: 'Section styles and callout labels',
    description: 'Defaults per section in `styles`, overridden per item. Nodes keep a standard size; labels that do not fit go into callouts (`label: auto`).',
    source: {
      version: '1',
      type: 'flowchart',
      title: 'Expense claims',
      styles: {
        nodes: { label: 'auto', fill: '#eff6ff', stroke: '#1d4ed8' },
        edges: { stroke: '#475569', arrowhead: 'open' },
        lanes: { fill: '#f1f5f9' },
      },
      lanes: [
        { id: 'emp', label: 'Employee' },
        { id: 'mgr', label: 'Manager', style: { fill: '#fef3c7' } },
        { id: 'fin', label: 'Finance' },
      ],
      nodes: [
        { id: 'start', shape: 'terminator', label: 'Start', lane: 'emp' },
        { id: 'submit', label: 'Submit claim with receipts and a short business justification', lane: 'emp' },
        { id: 'check', shape: 'decision', label: 'Within policy and budget for this quarter?', lane: 'mgr' },
        { id: 'return', label: 'Return for changes', lane: 'emp', style: { italic: true } },
        { id: 'pay', label: 'Reimburse within five working days', lane: 'fin', style: { bold: true, fill: '#dcfce7', stroke: '#15803d' } },
        { id: 'end', shape: 'terminator', label: 'End', lane: 'fin' },
      ],
      edges: [
        { from: 'start', to: 'submit' },
        { from: 'submit', to: 'check' },
        { from: 'check', to: 'pay', label: 'Yes', style: { stroke: '#15803d', labelFill: '#dcfce7' } },
        { from: 'check', to: 'return', label: 'No', style: { stroke: '#b91c1c', dash: 'dashed', arrowhead: 'diamond' } },
        { from: 'return', to: 'submit', style: { opacity: 0.5 } },
        { from: 'pay', to: 'end', style: { arrowhead: 'circle', lineWidth: 2 } },
      ],
    },
  },
];
