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
];
