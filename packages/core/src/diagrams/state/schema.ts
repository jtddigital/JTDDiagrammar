import { direction, envelope, id, ref, style } from '../../schema/fragments.ts';
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
    states: { type: 'array', items: { $ref: '#/$defs/state' }, description: 'Top-level states.' },
    transitions: {
      type: 'array',
      description: 'Drawn as `event [guard] / action`; endpoints may be any state, composite or nested.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          id: { ...id, description: 'Optional; generated when absent.' },
          from: ref('Source state id.'),
          to: ref('Target state id.'),
          event: { type: 'string', description: 'Trigger.' },
          guard: { type: 'string', description: 'Condition, shown in brackets.' },
          action: { type: 'string', description: 'Effect, shown after a slash.' },
          quote: { type: 'string', description: 'Supporting excerpt from the source material; shown as a tooltip.' },
          style,
        },
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
        kind: { type: 'string', enum: STATE_KINDS, default: 'state', description: '`state` (default) or a pseudostate; pseudostates draw no label and cannot contain states.' },
        label: { type: 'string', description: 'Defaults to the id for ordinary states.' },
        states: { type: 'array', description: 'Nested states make this a composite state.', items: { $ref: '#/$defs/state' } },
        quote: { type: 'string', description: 'Supporting excerpt from the source material; shown as a tooltip.' },
        style,
      },
    },
  },
} as const;
