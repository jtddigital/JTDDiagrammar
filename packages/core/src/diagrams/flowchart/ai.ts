import type { AiAssets } from '../../registry/diagram-type.ts';
import type { FlowBand, Flowchart, FlowLink, FlowNode } from './model.ts';
import { byId, edgeMatcher, pick } from '../../ai-merge.ts';
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
          owner: { type: 'string', description: 'Person or role who does this step, when the material names one.' },
          lane: { type: 'string', description: 'Lane id; required when lanes exist.' },
          phase: { type: 'string', description: 'Phase id; required when phases exist.' },
          quote: { type: 'string', description: 'Short verbatim excerpt from the material supporting this step.' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, quote: { type: 'string', description: 'Short verbatim excerpt supporting this connection.' } },
      },
    },
  },
} as const;

/** Generation stays flat (from, to): simpler for the model to produce reliably; nested on the way in. */
interface GeneratedEdge {
  from: string;
  to: string;
  label?: string;
  quote?: string;
}

interface Generated {
  title: string;
  direction: 'LR' | 'TB';
  lanes?: FlowBand[];
  phases?: FlowBand[];
  nodes: Omit<FlowNode, 'to'>[];
  edges: GeneratedEdge[];
}

/** Nest flat edges under their source nodes; edges from unknown nodes are dropped. */
function nestEdges(nodes: readonly Omit<FlowNode, 'to'>[], edges: readonly (GeneratedEdge & Partial<FlowLink>)[]): FlowNode[] {
  return nodes.map((n) => {
    const to = edges.filter((e) => e.from === n.id).map(({ from: _from, to, node: _node, ...rest }) => ({ node: to, ...rest }));
    return { ...n, ...(to.length && { to }) };
  });
}

/** Connections as flat edges, keeping only ids the author set. */
const flatEdges = (m: Pick<Flowchart, 'nodes'>) => m.nodes.flatMap((n) => (n.to ?? []).map((l) => ({ ...l, from: n.id, to: l.node })));

const guide = `Diagram type: flowchart.
- Nodes: "terminator" for start and end, "process" for steps, "decision" for questions (label as a question; label each outgoing edge with its answer), "document" for documents produced or used, "data" for inputs and outputs, "subprocess" for steps that are processes of their own, "connector" only to link distant parts.
- Edges follow the order in which work happens. Every node except the start should be reachable.
- If the material names who performs steps (roles, teams, departments, systems), make it cross-functional: one lane per actor in order of first appearance, every node assigned to its actor's lane, direction "LR".
- Add phases only when the material describes distinct stages; then every node needs a phase. Without lanes, omit lanes and phases and use direction "TB".
- Where the material supports a node or edge directly, set "quote" to a short verbatim excerpt (at most 20 words).`;

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
  toGenerated: (m) => ({
    title: m.title ?? '',
    direction: m.direction ?? 'LR',
    ...(m.lanes && { lanes: m.lanes.map((b) => pick(b, 'id', 'label')) }),
    ...(m.phases && { phases: m.phases.map((b) => pick(b, 'id', 'label')) }),
    nodes: m.nodes.map((n) => ({ id: n.id, shape: n.shape ?? 'process', label: n.label ?? n.id, ...pick(n, 'owner', 'lane', 'phase', 'quote') })),
    edges: flatEdges(m).map((e) => pick(e, 'from', 'to', 'label', 'quote')),
  }),
  // Restore what generation cannot express: theme, styles, order and side hints, edge ids, notes on surviving nodes.
  merge: (prev, next) => {
    const nodes = byId(prev.nodes);
    const bands = byId([...(prev.lanes ?? []), ...(prev.phases ?? [])]);
    const match = edgeMatcher(flatEdges(prev), (e) => e.label);
    const band = (b: FlowBand) => ({ ...b, ...pick(bands.get(b.id) ?? ({} as FlowBand), 'style') });
    const kept = new Set(next.nodes.map((n) => n.id));
    const notes = (prev.notes ?? []).filter((n) => n.for === undefined || kept.has(n.for));
    return {
      ...next,
      ...pick(prev, 'theme', 'styles', 'edgeStyle', 'styleBy'),
      ...(next.lanes && { lanes: next.lanes.map(band) }),
      ...(next.phases && { phases: next.phases.map(band) }),
      nodes: nestEdges(
        next.nodes.map(({ to: _to, ...n }) => ({ ...n, ...pick(nodes.get(n.id) ?? ({} as FlowNode), 'order', 'style') })),
        flatEdges(next).map((e) => {
          const p = match(e);
          return { from: e.from, to: e.to, ...pick(e, 'label', 'quote'), ...(p && pick(p, 'id', 'labels', 'exitSide', 'entrySide', 'style')) };
        }),
      ),
      ...(notes.length && { notes }),
    };
  },
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
      nodes: nestEdges(g.nodes, g.edges),
    };
  },
};
