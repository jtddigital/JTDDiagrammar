import { band, direction, envelope, id, ref, style } from '../../schema/fragments.ts';
import { FLOWCHART_SHAPES } from './model.ts';

const node = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id,
    shape: { type: 'string', enum: FLOWCHART_SHAPES, default: 'process', description: 'Default `process`.' },
    label: { type: 'string', description: 'Defaults to the id. `\\n` breaks lines; long text wraps.' },
    lane: ref('Lane id; required when the diagram has lanes.'),
    phase: ref('Phase id; required when the diagram has phases.'),
    order: { type: 'integer', description: 'Hint: nodes in the same column and lane are placed in ascending order.' },
    style,
  },
} as const;

const side = { type: 'string', enum: ['N', 'E', 'S', 'W'] } as const;

const note = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    id: { ...id, description: 'Optional; generated when absent.' },
    text: { type: 'string', description: 'Note text; `\\n` breaks lines.' },
    for: ref('Node the note is attached to (dotted line, no arrow).'),
    lane: ref('Lane, for a free-standing note in a cross-functional flowchart; attached notes use their node’s.'),
    phase: ref('Phase, likewise.'),
    style,
  },
} as const;

const edge = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to'],
  properties: {
    id: { ...id, description: 'Optional; generated when absent.' },
    from: ref('Source node id.'),
    to: ref('Target node id.'),
    label: { type: 'string', description: 'Text on the edge.' },
    fromSide: { ...side, description: 'Side to leave the source by (N, E, S, W); default follows the flow.' },
    toSide: { ...side, description: 'Side to enter the target by; default follows the flow.' },
    style,
  },
} as const;

export const flowchartSchema = {
  $id: 'urn:jtd:schema:v1:flowchart',
  title: 'Flowchart',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'nodes'],
  properties: {
    ...envelope('flowchart'),
    direction,
    lanes: { type: 'array', minItems: 1, items: band, description: 'Functional bands (rows for `LR`). Present → cross-functional flowchart.' },
    phases: { type: 'array', minItems: 1, items: band, description: 'Stages across the lanes. Require lanes.' },
    nodes: { type: 'array', items: node, description: 'Steps, decisions and other shapes.' },
    edges: { type: 'array', items: edge, description: 'Directed connections.' },
    notes: { type: 'array', items: note, description: 'Annotations, drawn as folded-corner notes.' },
  },
} as const;
