import { direction, edgeLabels, envelope, id, ref, sectionStyles, style, styleBy } from '../../schema/fragments.ts';
import { STATE_TYPES, STEP_KINDS } from './model.ts';

const side = { type: 'string', enum: ['N', 'E', 'S', 'W'] } as const;
const text = (description: string) => ({ type: 'string', description }) as const;
const texts = (description: string) => ({ type: 'array', items: { type: 'string' }, description }) as const;
const quote = text('Supporting excerpt from the source material; shown as a tooltip.');

export const lifecycleSchema = {
  $id: 'urn:jtd:schema:v1:lifecycle',
  title: 'Object lifecycle',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'states'],
  properties: {
    ...envelope('lifecycle'),
    object: text('Object API name, e.g. `change_control__c`; used as the title when there is none.'),
    direction,
    statesAs: { type: 'string', enum: ['columns', 'rows'], default: 'columns', description: 'States as columns (default) or rows; workflows take the other axis. Independent of `direction`.' },
    actionsLane: { type: 'boolean', description: 'Show the lifecycle actions band (states and user actions). Default: when any state has user actions.' },
    styles: sectionStyles(['stages', 'states', 'workflows', 'steps']),
    edgeStyle: { ...style, description: 'Default style for every connection and user action; each one’s own `style` overrides it field by field.' },
    styleBy: styleBy({ kind: STEP_KINDS, owner: undefined }, 'Step styles by kind and by owner, e.g. `{ "owner": { "QA": { "fill": "#dff" } } }`. Precedence: `styles.steps`, then kind, then owner, then the step’s own `style`.'),
    stages: {
      type: 'array',
      description: 'Lifecycle stage groups: a header over adjacent states.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'states'],
        properties: { id, label: text('Stage name.'), states: { type: 'array', items: ref('State id.'), description: 'Adjacent states, in lifecycle order.' }, style },
      },
    },
    states: {
      type: 'array',
      description: 'Object states, in lifecycle order: one column (or row) each.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id,
          label: text('Defaults to the id.'),
          stateType: { type: 'string', enum: STATE_TYPES, default: 'steady', description: 'Exactly one state is `initial`.' },
          entryCriteria: texts('Shown under the state header.'),
          entryActions: texts('Shown under the state header.'),
          quote,
          style,
          to: {
            type: 'array',
            description: 'User actions that move the record to another state, outside workflows; drawn in the lifecycle actions band.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['state'],
              properties: { state: ref('Target state id.'), label: text('Action name.'), labels: edgeLabels, id: { ...id, description: 'Optional; generated when absent.' }, quote, style },
            },
          },
        },
      },
    },
    workflows: {
      type: 'array',
      description: 'Workflows: one row (or column) each.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'steps'],
        properties: {
          id,
          label: text('Workflow name.'),
          style,
          steps: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id'],
              properties: {
                id,
                kind: { type: 'string', enum: STEP_KINDS, default: 'task', description: '`start`, `task` (default), `decision`, `notification`, `system` (an automated action, e.g. setting field values), `stateChange` or `end`.' },
                label: text('Defaults: the id; for a state change, the target state’s name.'),
                owner: text('Who performs the step; shown under a line below the label, and matched by `styleBy.owner`.'),
                state: ref('State the record is in during this step. Optional for a state change (defaults to its target).'),
                target: ref('For a state change: the state it moves the record to.'),
                order: { type: 'integer', description: 'Hint: steps in the same cell are placed in ascending order.' },
                quote,
                style,
                to: {
                  type: 'array',
                  description: 'Next steps.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['step'],
                    properties: {
                      step: ref('Next step id.'),
                      label: text('Text on the connection, placed where it fits best.'),
                      labels: edgeLabels,
                      exitSide: { ...side, description: 'Side of this step the line leaves by.' },
                      entrySide: { ...side, description: 'Side of the next step the line enters by.' },
                      id: { ...id, description: 'Optional; generated when absent.' },
                      quote,
                      style: { ...style, description: 'Overrides `edgeStyle` field by field.' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
