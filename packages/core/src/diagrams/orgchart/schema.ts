import { envelope, id, ref, style } from '../../schema/fragments.ts';

export const orgchartSchema = {
  $id: 'urn:jtd:schema:v1:orgchart',
  title: 'Org chart',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'people'],
  properties: {
    ...envelope('orgchart'),
    direction: { type: 'string', enum: ['TB', 'LR'], default: 'TB', description: 'Top to bottom (default) or left to right.' },
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
        },
      },
    },
  },
} as const;
