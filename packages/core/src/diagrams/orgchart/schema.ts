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
    styles: sectionStyles(['people', 'lines', 'departments']),
    departments: {
      type: 'array',
      description: 'Optional: a style, or a parent department, for departments named on people. Each department is drawn as a box around its people.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, description: 'As written in `people[].department`.' },
          parent: { type: 'string', description: 'The department this one is drawn inside.' },
          style,
        },
      },
    },
    tags: {
      type: 'object',
      propertyNames: { minLength: 1 },
      additionalProperties: style,
      description: 'A style per tag name, e.g. `{ "contractor": { "dash": "dashed" } }`. It decorates everyone whose `tags` include that name, over `styles.people`; a person\'s own `style` overrides it field by field. A tag styled here that no one has is a warning.',
    },
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
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            description: 'Tag names, e.g. `["contractor", "remote"]`. Each tag styled in the chart\'s `tags` decorates this person; where tags set the same field, the later one wins, and this person\'s own `style` wins over all of them.',
          },
          department: { type: 'string', minLength: 1, description: 'Department name. People in a department are boxed together, labelled with it; it needs no head, and their manager may be outside it. People reporting to different managers get a box under each.' },
        },
      },
    },
  },
} as const;
