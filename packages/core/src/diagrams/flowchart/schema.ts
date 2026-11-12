import { band, direction, edgeLabels, envelope, id, ref, sectionStyles, style, styleBy } from '../../schema/fragments.ts';
import { FLOWCHART_SHAPES } from './model.ts';

const side = { type: 'string', enum: ['N', 'E', 'S', 'W'] } as const;

/** A connection from the node it is nested under (URS-IN-009). */
const link = {
  type: 'object',
  additionalProperties: false,
  required: ['node'],
  properties: {
    node: ref('Target node id.'),
    label: { type: 'string', description: 'Text on the connection, placed where it fits best.' },
    labels: edgeLabels,
    exitSide: { ...side, description: 'Side of this node the line leaves by (N, E, S, W); default follows the flow.' },
    entrySide: { ...side, description: 'Side of the target the line enters by; default follows the flow.' },
    id: { ...id, description: 'Optional; generated when absent.' },
    quote: { type: 'string', description: 'Supporting excerpt from the source material; shown as a tooltip.' },
    style: { ...style, description: 'Overrides `edgeStyle` field by field.' },
  },
} as const;

const node = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id,
    shape: { type: 'string', enum: FLOWCHART_SHAPES, default: 'process', description: 'Default `process`.' },
    label: { type: 'string', description: 'Defaults to the id. `\\n` breaks lines; long text wraps.' },
    owner: { type: 'string', description: 'Who does it; shown under a line below the label, and matched by `styleBy.owner`.' },
    lane: ref('Lane id; required when the diagram has lanes.'),
    phase: ref('Phase id; required when the diagram has phases.'),
    order: { type: 'integer', description: 'Hint: nodes in the same column and lane are placed in ascending order.' },
    quote: { type: 'string', description: 'Supporting excerpt from the source material; shown as a tooltip.' },
    style,
    to: { type: 'array', items: link, description: 'Outgoing connections, each to one target node.' },
  },
} as const;


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

export const flowchartSchema = {
  $id: 'urn:jtd:schema:v1:flowchart',
  title: 'Flowchart',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'nodes'],
  properties: {
    ...envelope('flowchart'),
    direction,
    styles: sectionStyles(['lanes', 'phases', 'nodes', 'notes']),
    edgeStyle: { ...style, description: 'Default style for every connection; each one’s own `style` overrides it field by field.' },
    styleBy: styleBy({ shape: FLOWCHART_SHAPES, owner: undefined }, 'Node styles by shape and by owner, e.g. `{ "owner": { "Bill": { "fill": "#fdd" } } }`. Precedence: `styles.nodes`, then shape, then owner, then the node’s own `style`.'),
    lanes: { type: 'array', minItems: 1, items: band, description: 'Functional bands (rows for `LR`). Present → cross-functional flowchart.' },
    phases: { type: 'array', minItems: 1, items: band, description: 'Stages across the lanes. Require lanes.' },
    nodes: { type: 'array', items: node, description: 'Steps, decisions and other shapes.' },
    notes: { type: 'array', items: note, description: 'Annotations, drawn as folded-corner notes.' },
  },
} as const;
