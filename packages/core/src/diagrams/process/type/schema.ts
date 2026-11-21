import { annotation, envelope, id, inGroup, quote, ref, sectionStyles, style } from '../../../schema/fragments.ts';
import { annotationSchema, tagsSchema } from '../../annotations.ts';
import { eventsSchema } from '../events.ts';
import { NODE_KINDS } from '../model.ts';

const text = (description: string) => ({ type: 'string', description }) as const;
const refs = (description: string, to: string) => ({ type: 'array', items: ref('Id.', to), description }) as const;
const flag = (description: string) => ({ type: 'boolean', description }) as const;
const obj = (required: string[], properties: Record<string, unknown>, description?: string) => ({ type: 'object', additionalProperties: false, required, properties, ...(description && { description }) }) as const;
const values = { type: 'object', additionalProperties: { type: 'string' }, description: 'Tagged values of the stereotype, e.g. `{ "table": "wo" }`.' } as const;
/** What every element can carry: a stereotype with tagged values, and presentation. */
const element = {
  label: text('Defaults to the id.'),
  stereotype: text('Stereotype, e.g. "Work Order"; free text unless `profile` names a profile, which must define it.'),
  values,
  annotation: annotation(),
  tags: tagsSchema,
  quote: quote,
  style,
} as const;

/** The generic process type (URS-PM-020), in the canonical terms of ARCHITECTURE §13. */
export const processSchema = {
  $id: 'urn:jtd:schema:v1:process',
  title: 'Process',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'regions'],
  properties: {
    ...envelope('process'),
    profile: text('A registered platform profile (`sap`, `veeva`, `servicenow`) whose stereotypes and permission outcomes the chart uses. Without one, stereotypes are free text.'),
    object: obj(['label'], { label: text('The object, e.g. "Work order"; the title when there is none.'), stereotype: element.stereotype, values }, 'The object whose behaviour the chart shows.'),
    info: { type: 'object', additionalProperties: { type: 'string' }, description: 'Title block, e.g. `{ "Platform": "Maximo" }`.' },
    ...annotationSchema,
    legend: { type: 'boolean', default: true, description: 'Draw a legend of the shapes and lines used.' },
    styles: sectionStyles(['states', 'tasks']),
    edgeStyle: { ...style, description: 'Default style for every arrow.' },
    regions: {
      type: 'array',
      description: 'Regions: independent dimensions of the object’s status, one row each; exactly one state of each is active.',
      items: obj(['id', 'states'], {
        id,
        label: text('Row label; defaults to the id.'),
        states: {
          type: 'array',
          minItems: 1,
          items: obj(['id'], {
            id,
            ...element,
            initial: flag('The region starts here.'),
            final: flag('Entering it ends the region.'),
            entry: inGroup('links', refs('Operations called on entry.', 'operations')),
          }),
        },
      }),
    },
    operations: {
      type: 'array',
      description: 'Operations: what can be invoked on the object; transitions wait for them and workflow tasks call them.',
      items: obj(['id'], { id, ...element, callers: { type: 'array', items: { type: 'string', enum: ['user', 'job'] }, uniqueItems: true, description: 'Who calls it directly, outside workflows.' } }),
    },
    transitions: {
      type: 'array',
      description: 'Moves between two states of one region.',
      items: obj(['from', 'to'], {
        id: { ...id, description: 'Optional; generated when absent.' },
        from: ref('State id.', 'states'),
        to: ref('State id, in the same region.', 'states'),
        trigger: inGroup('links', obj(
          [],
          {
            call: ref('Operation it waits for.', 'operations'),
            signal: ref('Signal it waits for.', 'signals'),
            after: text('Time after entering the state, e.g. "30d".'),
            at: text('A point in time, e.g. "Year end".'),
            when: ref('Rule whose becoming true fires it.', 'rules'),
          },
          'Exactly one of `call`, `signal`, `after`, `at` or `when`. Without a trigger, the transition is reported.',
        )),
        guard: ref('Rule that must hold.', 'rules'),
        label: text('Arrow label; defaults to the trigger.'),
        quote,
        style,
      }),
    },
    permissions: {
      type: 'array',
      description: 'What each state allows: state × operation [× role] → outcome. Forbidden wins over allowed across the active states.',
      items: obj(['state', 'operation', 'outcome'], { state: ref('State id.', 'states'), operation: ref('Operation id.', 'operations'), role: text('Role it applies to; any when absent.'), outcome: text('`allowed`, `forbidden`, or an outcome the profile adds (e.g. `warning` for `sap`).') }),
    },
    ...eventsSchema('State whose entry publishes it; or leave it out when only workflows send it.', false),
    workflows: {
      type: 'array',
      description: 'Workflows (activities): one row each.',
      items: obj(['id', 'label', 'nodes', 'flows'], {
        id,
        ...element,
        label: text('Workflow name.'),
        nodes: {
          type: 'array',
          minItems: 1,
          items: obj(['id', 'kind'], {
            id,
            ...element,
            kind: { type: 'string', enum: NODE_KINDS, description: '`initial`, `final`, `task`, `decision` and `merge` (exclusive), `fork` and `join` (parallel), or `send` (publishes a signal).' },
            role: text('Who performs it; shown under the label.'),
            calls: inGroup('links', refs('Operations it calls.', 'operations')),
            signal: ref('For `send`: the signal it publishes.', 'signals'),
          }),
        },
        flows: {
          type: 'array',
          items: obj(['from', 'to'], { from: ref('Node id.', 'nodes'), to: ref('Node id.', 'nodes'), guard: text('Outcome or rule id it is taken on; the arrow label.') }),
        },
      }),
    },
  },
} as const;
