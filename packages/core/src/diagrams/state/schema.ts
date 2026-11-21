import { direction, edgeLabels, envelope, id, inGroup, quote, ref, sectionStyles, style } from '../../schema/fragments.ts';
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
    styles: sectionStyles(['states']),
    states: { type: 'array', items: { $ref: '#/$defs/state' }, description: 'Top-level states.' },
    transitionStyle: { ...style, description: 'Default style for every transition; each one’s own `style` overrides it field by field.' },
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
        states: inGroup('placement', { type: 'array', description: 'Nested states make this a composite state.', items: { $ref: '#/$defs/state' } }),
        quote,
        style,
        to: inGroup('links', { type: 'array', items: { $ref: '#/$defs/transition' }, description: 'Outgoing transitions; targets may be any state, composite or nested.' }),
      },
    },
    transition: {
      type: 'object',
      additionalProperties: false,
      required: ['state'],
      description: 'Drawn as `event [guard] / action`.',
      properties: {
        state: ref('Target state id.', 'states'),
        event: { type: 'string', description: 'Trigger.' },
        guard: { type: 'string', description: 'Condition, shown in brackets.' },
        action: { type: 'string', description: 'Effect, shown after a slash.' },
        labels: edgeLabels,
        id: { ...id, description: 'Optional; generated when absent.' },
        quote,
        style: { ...style, description: 'Overrides `transitionStyle` field by field.' },
      },
    },
  },
} as const;
