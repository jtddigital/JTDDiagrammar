import { pointer } from '../../diagnostics.ts';
import type { EditAssets } from '../../registry/diagram-type.ts';
import type { Flowchart, FlowchartShape } from './model.ts';

const SHAPES: [FlowchartShape, string, string][] = [
  ['process', 'Process', 'New step'],
  ['decision', 'Decision', 'Decision?'],
  ['terminator', 'Start / end', 'Start'],
  ['document', 'Document', 'Document'],
  ['data', 'Data', 'Data'],
  ['subprocess', 'Subprocess', 'Subprocess'],
  ['hexagon', 'Preparation', 'Preparation'],
  ['connector', 'Connector', ''],
];

/** Toolbar editing (URS-EXT-012): a node of any shape, in the first lane and phase when there are some; links between nodes. */
export const flowchartEdit: EditAssets<Flowchart> = {
  add: SHAPES.map(([shape, label, text]) => ({
    label,
    make: (id, m) => ({
      at: '/nodes',
      append: true,
      value: { id, shape, ...(text && { label: text }), ...(m.lanes?.[0] && { lane: m.lanes[0].id }), ...(m.phases?.[0] && { phase: m.phases[0].id }) },
    }),
  })),
  connect: (m, { id: from }, { id: to }) => {
    const i = m.nodes.findIndex((n) => n.id === from);
    if (i < 0 || !m.nodes.some((n) => n.id === to)) return undefined;
    return { at: pointer('nodes', i, 'to'), append: true, value: { node: to } };
  },
};
