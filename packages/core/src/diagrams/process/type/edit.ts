import { pointer } from '../../../diagnostics.ts';
import type { EditAssets } from '../../../registry/diagram-type.ts';
import type { ProcessDoc } from './model.ts';

const STATE = /^\/regions\/(\d+)\/states\/(\d+)$/;
const NODE = /^\/workflows\/(\d+)\/nodes\/(\d+)$/;
const NODES: [string, string, string][] = [
  ['task', 'Task', 'New task'],
  ['decision', 'Decision', 'Decision?'],
  ['final', 'Workflow end', ''],
];

/**
 * Toolbar editing (URS-EXT-012): states (first region) and nodes of the first workflow; a state to a
 * state of the same region is a transition, a node to a node of the same workflow a flow.
 */
export const processEdit: EditAssets<ProcessDoc> = {
  add: [
    { label: 'State', make: (id) => ({ at: '/regions/0/states', append: true, value: { id } }), available: (m) => m.regions.length > 0 },
    ...NODES.map(([kind, label, text]) => ({
      label,
      make: (id: string) => ({ at: '/workflows/0/nodes', append: true, value: { id, kind, ...(text && { label: text }) } }),
      available: (m: ProcessDoc) => Boolean(m.workflows?.length),
    })),
    // A send node publishes a signal: the first one, until changed in Details.
    {
      label: 'Send signal',
      make: (id, m) => ({ at: '/workflows/0/nodes', append: true, value: { id, kind: 'send', label: 'Send', signal: m.signals![0]!.id } }),
      available: (m) => Boolean(m.workflows?.length && m.signals?.length),
    },
  ],
  connect: (m, from, to) => {
    const [a, b] = [STATE.exec(from.src ?? ''), STATE.exec(to.src ?? '')];
    if (a && b) {
      if (a[1] !== b[1] || a[2] === b[2]) return undefined;
      const states = m.regions[Number(a[1])]!.states;
      return { at: '/transitions', append: true, value: { from: states[Number(a[2])]!.id, to: states[Number(b[2])]!.id } };
    }
    const [s, t] = [NODE.exec(from.src ?? ''), NODE.exec(to.src ?? '')];
    if (!s || !t || s[1] !== t[1] || s[2] === t[2]) return undefined;
    const nodes = m.workflows![Number(s[1])]!.nodes;
    return { at: pointer('workflows', Number(s[1]), 'flows'), append: true, value: { from: nodes[Number(s[2])]!.id, to: nodes[Number(t[2])]!.id } };
  },
};
