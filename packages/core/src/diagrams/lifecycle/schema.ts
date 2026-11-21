import { annotation as note, direction, edgeLabels, envelope, id, inGroup, quote, ref, sectionStyles, style, styleBy } from '../../schema/fragments.ts';
import { annotationSchema, tagsSchema } from '../annotations.ts';
import { eventsSchema } from '../process/events.ts';
import { ANNOTATED, COMPLETIONS, STATE_TYPES, STEP_KINDS, TRIGGERS } from './model.ts';

const side = { type: 'string', enum: ['N', 'E', 'S', 'W'] } as const;
const text = (description: string) => ({ type: 'string', description }) as const;
const texts = (description: string) => ({ type: 'array', items: { type: 'string' }, description }) as const;
const flag = (description: string) => ({ type: 'boolean', description }) as const;
const map = (description: string) => ({ type: 'object', additionalProperties: { type: 'string' }, description }) as const;
const rules = { type: 'array', items: ref('Rule id.', 'rules'), description: 'Rules (from the chart’s `rules`) this depends on; shown with its text.' } as const;
const optionalId = { ...id, description: 'Optional; generated when absent.' };
const main = inGroup('appearance', flag('On the main path: drawn bold while other connections fade.'));
const annotation = note('Annotation: a numbered marker on the shape, with the text in the notes beside the chart, as on an engineering drawing.');
const annotate = inGroup('notes', flag('Put the descriptive text in the annotation instead of on the chart. Default: the chart’s `annotate` for this shape type.'));

/** A user action's fields; shared actions add their source states (URS-TYP-008, URS-TYP-009). */
const action = {
  state: ref('Target state id.', 'states'),
  label: text('Action name.'),
  labels: edgeLabels,
  by: { type: 'string', enum: ['user', 'job'], default: 'user', description: '`job`: a scheduled job makes the change (timer icon).' },
  after: text('For a job: when, e.g. "2 years"; shown after the name.'),
  main,
  id: optionalId,
  quote,
  style,
} as const;

/** A connection's routing and look, shared by `to` and `verdicts`. */
const link = {
  step: ref('Next step id.', 'steps'),
  labels: edgeLabels,
  exitSide: inGroup('placement', { ...side, description: 'Side of this step the line leaves by.' }),
  entrySide: inGroup('placement', { ...side, description: 'Side of the next step the line enters by.' }),
  main,
  id: optionalId,
  quote,
  style: { ...style, description: 'Overrides `edgeStyle` field by field.' },
} as const;

const step = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id,
    kind: {
      type: 'string',
      enum: STEP_KINDS,
      default: 'task',
      description: '`start` (a play button in a ring), `task` (default), `decision`, `notification`, `system` (an automated action, e.g. setting field values), `stateChange`, `parallel` and `join` (a bar where branches split or meet) or `end` (an X in a ring).',
    },
    label: text('Defaults: the id; for a state change, the target state’s name.'),
    owner: text('Who performs the step (for a notification, who receives it); shown under a line below the label, matched by `styleBy.owner`, and its role band with `roleLanes`.'),
    state: inGroup('placement', ref('State the record is in during this step. Optional for a state change (defaults to its target).', 'states')),
    target: ref('For a state change: the state it moves the record to.', 'states'),
    fields: texts('Task: fields the participant completes. System action: fields it sets, e.g. "Approval date = today". Shown under the label.'),
    rules,
    verdicts: inGroup('links', {
      type: 'array',
      description: 'Task outcomes, each leading to a next step; no decision diamond needed.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'step'],
        properties: {
          name: text('Verdict, e.g. "Approve"; the connection’s label.'),
          signature: flag('Needs an eSignature (icon on the label).'),
          reasons: texts('Reasons offered; shown in the tooltip.'),
          comment: flag('A comment is required; shown in the tooltip.'),
          ...link,
        },
      },
    }),
    signature: flag('Task: needs an eSignature (badge).'),
    due: text('Task: time allowed, e.g. "5d" (badge).'),
    completion: { type: 'string', enum: COMPLETIONS, description: 'Task with several participants: `all` must complete, `any` one completes, or `each` gets a task (badge).' },
    order: inGroup('placement', { type: 'integer', description: 'Hint: steps in the same cell are placed in ascending order.' }),
    annotation,
    tags: tagsSchema,
    annotate,
    quote,
    style,
    to: inGroup('links', {
      type: 'array',
      description: 'Next steps.',
      items: { type: 'object', additionalProperties: false, required: ['step'], properties: { label: text('Text on the connection, placed where it fits best.'), ...link } },
    }),
  },
} as const;

export const lifecycleSchema = {
  $id: 'urn:jtd:schema:v1:lifecycle',
  title: 'Object lifecycle',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'states'],
  properties: {
    ...envelope('lifecycle'),
    object: text('Object API name, e.g. `change_control__c`; used as the title when there is none, else shown in the title block.'),
    info: map('Title block under the title, e.g. `{ "Lifecycle": "Change Control", "Version": "3" }`.'),
    direction,
    statesAs: { type: 'string', enum: ['columns', 'rows'], default: 'columns', description: 'States as columns (default) or rows; workflows take the other axis. Independent of `direction`.' },
    view: { type: 'string', enum: ['detailed', 'summary'], default: 'detailed', description: '`summary`: only the states and the transitions between them; each workflow collapses into dashed arrows.' },
    actionsLane: flag('Show the lifecycle actions band (states, user actions, workflow starts). Default: when there is something to show in it.'),
    roleLanes: flag('Split each workflow into one band per role (step owner); steps without an owner go in a System band.'),
    legend: { type: 'boolean', default: true, description: 'Draw a legend of the shapes, colours and markers used.' },
    styles: sectionStyles(['stages', 'states', 'workflows', 'steps']),
    edgeStyle: { ...style, description: 'Default style for every connection and user action; each one’s own `style` overrides it field by field.' },
    annotate: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(ANNOTATED.map((k) => [k, { type: 'boolean' }])),
      description:
        'By shape type, like `styles`: `true` puts the descriptive text into annotations instead of on the chart. `gates` (label, required fields and criteria), `records` (starting values), `steps` (every step’s fields), or a step kind (`task`, `system`, …) over `steps`. Each item’s own `annotate` wins. E.g. `{ "gates": true, "task": true }`.',
    },
    ...annotationSchema,
    showOwners: { type: 'boolean', default: true, description: 'Show each step’s owner under its label. Off, owners still pick their role band and `styleBy.owner` colour.' },
    styleBy: styleBy(
      { kind: STEP_KINDS, owner: undefined, stateType: STATE_TYPES },
      'Step styles by kind and owner, state styles by type, e.g. `{ "owner": { "QA": { "fill": "#dff" } } }`. Precedence: section default, then kind (or state type), then owner, then the item’s own `style`.',
    ),
    stages: {
      type: 'array',
      description: 'Lifecycle stage groups: a header over adjacent states.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'states'],
        properties: { id, label: text('Stage name.'), states: { type: 'array', items: ref('State id.', 'states'), description: 'Adjacent states, in lifecycle order.' }, style },
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
          stateType: { type: 'string', enum: STATE_TYPES, default: 'steady', description: 'Exactly one state is `initial`. `final` and `cancelled` end the lifecycle. Initial, final and cancelled states are tinted.' },
          entryCriteria: texts('Shown under the state header. To draw them in front of the state, use `gate`.'),
          entryActions: texts('Shown under the state header.'),
          security: map('Access per role in this state, e.g. `{ "Owner": "Edit", "Viewer": "Read" }`; shown under the header.'),
          gate: {
            type: 'object',
            additionalProperties: false,
            description: 'What must hold to enter the state: a small gate in front of its pill in the actions band, its text beside it (or in an annotation); every user action, shared action and transition into the state passes it.',
            properties: {
              label: text('Defaults to "Gate".'),
              fields: texts('Fields that must be complete; shown as "Required: …".'),
              criteria: texts('Entry criteria, one per line.'),
              rules,
              annotation,
              tags: tagsSchema,
              annotate,
              quote,
              style,
            },
          },
          records: {
            type: 'array',
            description: 'Child (related) records made in this state: drawn in the actions band next to the state, joined to it by a dotted line, not as workflow steps.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['record'],
              properties: {
                record: text('Object of the child record, e.g. "Change Action".'),
                label: text('Defaults to the object.'),
                fields: texts('Values it is created with, e.g. "Owner = Change Owner"; shown under the label.'),
                annotation,
                tags: tagsSchema,
                annotate,
                quote,
                style,
              },
            },
          },
          annotation,
          tags: tagsSchema,
          quote,
          style,
          to: inGroup('links', {
            type: 'array',
            description: 'User actions that move the record to another state, outside workflows; drawn in the lifecycle actions band.',
            items: { type: 'object', additionalProperties: false, required: ['state'], properties: action },
          }),
        },
      },
    },
    sharedActions: {
      type: 'array',
      description: 'User actions available in several states (e.g. Cancel), each drawn once.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['state'],
        properties: {
          ...action,
          from: { type: 'array', items: ref('State id.', 'states'), description: 'Source states. Default: every state that is not final or cancelled.' },
          except: { type: 'array', items: ref('State id.', 'states'), description: 'States left out of the default.' },
          annotation,
          tags: tagsSchema,
        },
      },
    },
    ...eventsSchema('State whose entry publishes it.'),
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
          roles: texts('With `roleLanes`: role bands in this order; other owners follow.'),
          start: {
            type: 'object',
            additionalProperties: false,
            required: ['state'],
            description: 'What starts the workflow: a dashed arrow from the state in the actions band to the start step.',
            properties: {
              state: ref('State it is started in.', 'states'),
              action: text('User action name; defaults by `by`.'),
              by: { type: 'string', enum: TRIGGERS, default: 'user', description: '`user` action, `entry` into the state, or a scheduled `job`.' },
            },
          },
          steps: { type: 'array', items: step },
        },
      },
    },
  },
} as const;
