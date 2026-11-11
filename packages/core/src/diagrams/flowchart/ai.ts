import type { AiAssets } from '../../registry/diagram-type.ts';
import type { FlowBand, FlowEdge, Flowchart, FlowNode } from './model.ts';
import { FLOWCHART_SHAPES } from './model.ts';

const id = { type: 'string', description: 'Short unique id: lowercase letters, digits, "_" or "-", starting with a letter.' } as const;
const band = { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id, label: { type: 'string' } } } as const;

/** Structured-outputs-safe schema (URS-AI-004): no patterns, length or count constraints, no defaults. */
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'direction', 'nodes', 'edges'],
  properties: {
    title: { type: 'string' },
    direction: { type: 'string', enum: ['LR', 'TB'] },
    lanes: { type: 'array', description: 'One per actor (role, team, system). Omit if no actors are named.', items: band },
    phases: { type: 'array', description: 'Only for distinct stages; requires lanes.', items: band },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'shape', 'label'],
        properties: {
          id,
          shape: { type: 'string', enum: FLOWCHART_SHAPES },
          label: { type: 'string' },
          lane: { type: 'string', description: 'Lane id; required when lanes exist.' },
          phase: { type: 'string', description: 'Phase id; required when phases exist.' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } },
      },
    },
  },
} as const;

interface Generated {
  title: string;
  direction: 'LR' | 'TB';
  lanes?: FlowBand[];
  phases?: FlowBand[];
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const guide = `Diagram type: flowchart.
- Nodes: "terminator" for start and end, "process" for steps, "decision" for questions (label as a question; label each outgoing edge with its answer), "document" for documents produced or used, "data" for inputs and outputs, "subprocess" for steps that are processes of their own, "connector" only to link distant parts.
- Edges follow the order in which work happens. Every node except the start should be reachable.
- If the material names who performs steps (roles, teams, departments, systems), make it cross-functional: one lane per actor in order of first appearance, every node assigned to its actor's lane, direction "LR".
- Add phases only when the material describes distinct stages; then every node needs a phase. Without lanes, omit lanes and phases and use direction "TB".`;

const examples = [
  {
    input: 'When a customer places an order, Sales checks stock. If the item is in stock the warehouse ships it; otherwise Sales notifies the customer of a backorder.',
    output: {
      title: 'Order handling',
      direction: 'LR',
      lanes: [
        { id: 'customer', label: 'Customer' },
        { id: 'sales', label: 'Sales' },
        { id: 'warehouse', label: 'Warehouse' },
      ],
      nodes: [
        { id: 'place', shape: 'terminator', label: 'Place order', lane: 'customer' },
        { id: 'stock', shape: 'decision', label: 'In stock?', lane: 'sales' },
        { id: 'ship', shape: 'process', label: 'Ship order', lane: 'warehouse' },
        { id: 'notify', shape: 'process', label: 'Notify backorder', lane: 'sales' },
      ],
      edges: [
        { from: 'place', to: 'stock' },
        { from: 'stock', to: 'ship', label: 'Yes' },
        { from: 'stock', to: 'notify', label: 'No' },
      ],
    },
  },
];

export const flowchartAi: AiAssets<Flowchart> = {
  schema,
  guide,
  examples,
  // Empty lanes/phases arrays are dropped: authoring requires at least one entry.
  fromGenerated: (generated) => {
    const g = generated as Generated;
    return {
      version: '1',
      type: 'flowchart',
      title: g.title,
      direction: g.direction,
      ...(g.lanes?.length ? { lanes: g.lanes } : {}),
      ...(g.phases?.length ? { phases: g.phases } : {}),
      nodes: g.nodes,
      edges: g.edges,
    };
  },
};
