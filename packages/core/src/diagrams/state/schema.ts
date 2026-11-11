import { direction, envelope, id, style } from '../../schema/fragments.ts';
import { STATE_KINDS } from './model.ts';

export const stateSchema = {
  $id: 'urn:jtd:schema:v1:state',
  title: 'State diagram',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'states'],
  properties: {
    ...envelope('state'),
    direction,
    states: { type: 'array', items: { $ref: '#/$defs/state' } },
    transitions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: { id, from: id, to: id, event: { type: 'string' }, guard: { type: 'string' }, action: { type: 'string' }, style },
      },
    },
  },
  $defs: {
    state: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id,
        kind: { type: 'string', enum: STATE_KINDS, default: 'state' },
        label: { type: 'string', description: 'Defaults to the id for ordinary states.' },
        states: { type: 'array', description: 'Nested states make this a composite state.', items: { $ref: '#/$defs/state' } },
        style,
      },
    },
  },
} as const;
