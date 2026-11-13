import { envelope, id, ref, sectionStyles, style } from '../../schema/fragments.ts';

export const orgchartSchema = {
  $id: 'urn:jtd:schema:v1:orgchart',
  title: 'Org chart',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'people'],
  properties: {
    ...envelope('orgchart'),
    direction: { type: 'string', enum: ['TB', 'LR'], default: 'TB', description: 'Top to bottom (default) or left to right.' },
    styles: sectionStyles(['people', 'lines']),
    stack: { type: 'boolean', default: false, description: 'Stack each team under its manager instead of spreading it in a row: a column when top to bottom, a row when left to right.' },
    multi: { type: 'integer', minimum: 1, maximum: 12, description: 'Split each stacked team into this many columns (rows when left to right). Implies `stack`.' },
    people: {
      type: 'array',
      description: 'Everyone in the chart.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name'],
        properties: {
          id,
          name: { type: 'string', description: 'Shown first, on its own line.' },
          title: { type: 'string', description: 'Role, shown under the name.' },
          manager: ref('Id of the person this person reports to; omit at the top.'),
          quote: { type: 'string', description: 'Supporting excerpt from the source material; shown as a tooltip.' },
          style,
          stack: { type: 'boolean', description: "This person's team: stacked (true) or in a row (false). Default: the chart's `stack`." },
          multi: { type: 'integer', minimum: 1, maximum: 12, description: "This person's team stacked in this many columns (rows when left to right)." },
        },
      },
    },
  },
} as const;
