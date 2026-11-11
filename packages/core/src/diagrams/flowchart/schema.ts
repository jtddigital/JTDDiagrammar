import { band, direction, envelope, id } from '../../schema/fragments.ts';
import { FLOWCHART_SHAPES } from './model.ts';

const node = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id,
    shape: { type: 'string', enum: FLOWCHART_SHAPES, default: 'process' },
    label: { type: 'string', description: 'Defaults to the id.' },
    lane: id,
    phase: id,
    order: { type: 'integer', description: 'Ordering hint within a cell (URS-DM-008).' },
  },
} as const;

const edge = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to'],
  properties: { id, from: id, to: id, label: { type: 'string' } },
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
    lanes: { type: 'array', minItems: 1, items: band },
    phases: { type: 'array', minItems: 1, items: band },
    nodes: { type: 'array', items: node },
    edges: { type: 'array', items: edge },
  },
} as const;
