import { envelope, id, ref, sectionStyles, style } from '../../schema/fragments.ts';
import { annotationSchema, tagsSchema } from '../annotations.ts';
import { REWORK, RULES } from './model.ts';

const text = (description: string) => ({ type: 'string', description }) as const;
const texts = (description: string) => ({ type: 'array', items: { type: 'string' }, description }) as const;
const flag = (description: string) => ({ type: 'boolean', description }) as const;
const code = { type: 'string', pattern: '^[A-Za-z0-9_][A-Za-z0-9_.-]*$', description: 'Status code, e.g. `REL` or `INIT`; unique across system and user statuses.' } as const;
const codeRef = (description: string) => ({ ...code, description }) as const;
const notes = {
  annotation: text('Annotation: a numbered marker on the shape, with the text in the notes beside the chart.'),
  tags: tagsSchema,
  quote: text('Supporting excerpt from the source material; shown as a tooltip.'),
  style,
} as const;
const txRefs = (description: string) => ({ type: 'array', items: ref('Business transaction id.'), description }) as const;
const obj = (required: string[], properties: Record<string, unknown>, description?: string) => ({ type: 'object', additionalProperties: false, required, properties, ...(description && { description }) }) as const;

const step = obj(['id'], {
  id,
  label: text('Defaults to "Approve".'),
  recipients: text('Who approves, e.g. a role found by agent determination; shown under the label.'),
  conditions: texts('Step conditions: the step runs only when they hold, else it is skipped. Shown as "If: …" under the label, or in its annotation with `annotate`.'),
  deadline: text('Time allowed, e.g. "2d" (clock badge).'),
  optional: flag('Optional step (dashed).'),
  rework: { type: 'string', enum: REWORK, description: 'The approver can send it back to the requester for rework; after resubmission the workflow `repeat`s the step, `continue`s with the next, or `restart`s.' },
  status: codeRef('Status the object is in during the step, which places it; default the workflow’s trigger status.'),
  ...notes,
});

/** SAP status management and flexible workflow (URS-TYP-019..021). */
export const sapSchema = {
  $id: 'urn:jtd:schema:v1:sap',
  title: 'SAP status and workflow',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type'],
  properties: {
    ...envelope('sap'),
    object: text('Object, e.g. "Maintenance order (PM01)"; the title when there is none, else shown in the title block.'),
    profile: text('Status profile, e.g. `ZPMORD`; shown in the title block.'),
    info: { type: 'object', additionalProperties: { type: 'string' }, description: 'More of the title block, e.g. `{ "Order type": "PM01" }`.' },
    matrix: flag('Draw transaction control as a matrix: one row per business transaction, a mark per status that allows it (✓), allows it with a warning (!), forbids it (⊘), sets it (+) or deletes it (−).'),
    transitions: { type: 'string', enum: ['arrows', 'ranges'], default: 'arrows', description: '`arrows`: from each numbered user status to every status in its range. `ranges`: the range written under the status instead.' },
    annotate: flag('Put start and step conditions into annotations instead of on the chart.'),
    ...annotationSchema,
    legend: { type: 'boolean', default: true, description: 'Draw a legend of the shapes, marks and lines used.' },
    styles: sectionStyles(['systemStatuses', 'userStatuses', 'steps']),
    edgeStyle: { ...style, description: 'Default style for every arrow.' },
    systemStatuses: {
      type: 'array',
      description: 'System statuses in order, e.g. CRTD, REL, TECO, CLSD: the top row. Only business transactions set them.',
      items: obj(['code'], { code, label: text('Text, e.g. "Released".'), ...notes }),
    },
    userStatuses: {
      type: 'array',
      description: 'The status profile’s user statuses: numbered ones in sequence (one active at a time) and flags without a number (any number active).',
      items: obj(['code'], {
        code,
        label: text('Text, e.g. "Approved"; the column header.'),
        number: { type: 'integer', minimum: 1, maximum: 99, description: 'Status number: its place in the sequence. Without one the status is a flag.' },
        low: { type: 'integer', minimum: 1, maximum: 99, description: 'Lowest number the next status may have; default its own.' },
        high: { type: 'integer', minimum: 1, maximum: 99, description: 'Highest number the next status may have; default its own.' },
        initial: flag('Set when the object is created.'),
        system: codeRef('System status it is used in, which places its column; default the previous numbered status’s.'),
        auth: text('Authorization key: who may set or delete it.'),
        control: {
          type: 'object',
          additionalProperties: { type: 'string', enum: RULES },
          description: 'Transaction control while it is active, by business transaction id: `allowed`, `warning` (allowed with a warning) or `forbidden`.',
        },
        setBy: txRefs('Business transactions that set it.'),
        deletedBy: txRefs('Business transactions that delete it.'),
        ...notes,
      }),
    },
    transactions: {
      type: 'array',
      description: 'Business transactions, e.g. Release or Complete technically.',
      items: obj(['id'], { id, label: text('Defaults to the id.'), sets: { type: 'array', items: codeRef('System status code.'), description: 'System statuses it sets; labels the arrow into each.' }, ...notes }),
    },
    workflows: {
      type: 'array',
      description: 'Flexible workflows: one row each.',
      items: obj(['id', 'label', 'steps'], {
        id,
        label: text('Workflow name.'),
        trigger: obj(['status'], { status: codeRef('Status whose setting raises the event that starts it.'), event: text('Event, e.g. "Order created"; default "<status> set".') }, 'What starts it: a dashed arrow from the status.'),
        conditions: texts('Start conditions: the workflow is used only when they hold. Drawn as a gate.'),
        steps: { type: 'array', minItems: 1, items: step, description: 'Approval steps, in order: Release leads on, Reject cancels the workflow.' },
        released: codeRef('Status set when it is released.'),
        rejected: codeRef('Status set when it is rejected.'),
        ...notes,
      }),
    },
    releaseStrategies: {
      type: 'array',
      description: 'Classic release strategies, e.g. for purchase requisitions: one row each.',
      items: obj(['id', 'label', 'codes'], {
        id,
        label: text('Strategy name, e.g. "Z1 Requisitions over 10,000 EUR".'),
        document: ref('Document it releases: a dashed arrow from the document starts it.'),
        status: codeRef('Status the object is in while it runs, which places it; default the document’s.'),
        conditions: texts('Release conditions (classification), e.g. "Total value > 10,000 EUR": the strategy applies only when they hold, else the document is released at once. Drawn as a gate.'),
        codes: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          description: 'Release codes (release points), at most eight.',
          items: obj(['code'], {
            code: { type: 'string', pattern: '^[A-Za-z0-9]{1,2}$', description: 'Two-character release code, e.g. `P1`.' },
            label: text('Who releases, e.g. "Purchasing manager".'),
            prerequisites: { type: 'array', items: text('Release code.'), description: 'Codes that must release first; none: released straight away.' },
            indicator: text('Release indicator once released, e.g. "2 – Released, changeable".'),
            ...notes,
          }),
        },
        ...notes,
      }),
    },
    documents: {
      type: 'array',
      description: 'The document flow: documents created as the object moves on, e.g. a purchase requisition on release. One row.',
      items: obj(['id', 'label'], {
        id,
        label: text('Document, e.g. "Purchase requisition".'),
        kind: text('Document type, e.g. "NB"; shown under the label.'),
        status: codeRef('Status in which it is created: its column, and a dotted line from that status.'),
        from: { type: 'array', items: ref('Document id.'), description: 'Preceding documents: an arrow from each.' },
        ...notes,
      }),
    },
  },
} as const;
