import { envelope, id, sectionStyles, style, styleBy } from '../../schema/fragments.ts';
import { WEEKDAYS } from './dates.ts';
import { COLUMNS, ITEM_TYPES, LINK_PATTERN } from './model.ts';

const date = (description: string) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: `${description} \`YYYY-MM-DD\`.` }) as const;

export const ganttSchema = {
  $id: 'urn:jtd:schema:v1:gantt',
  title: 'Gantt chart',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'type', 'start', 'tasks'],
  properties: {
    ...envelope('gantt'),
    start: date('Project start: items without fixed dates start no earlier.'),
    deadline: date('Finishing after this date is a warning; drawn as a red line.'),
    calendar: {
      type: 'object',
      additionalProperties: false,
      description: 'Working days. Durations and lags count working days only.',
      properties: {
        workdays: { type: 'array', uniqueItems: true, items: { type: 'string', enum: WEEKDAYS }, description: 'Days of the week that are worked (default Monday to Friday). List all seven to count calendar days.' },
        holidays: { type: 'array', items: date('A day off.'), description: 'Days off, shaded and skipped.' },
      },
    },
    columns: { type: 'array', uniqueItems: true, items: { type: 'string', enum: COLUMNS }, description: 'Table columns, in order (default: wbs, name, owner, start, end, duration). An empty list draws no table.' },
    styles: sectionStyles(['tasks', 'links']),
    styleBy: styleBy({ type: [...ITEM_TYPES, 'summary'], owner: undefined }, 'Styles by item type (and `summary` for items with items inside) and by owner. Precedence: `styles.tasks`, then type, then owner, then tags, then the item\'s own `style`.'),
    tags: { type: 'object', propertyNames: { minLength: 1 }, additionalProperties: style, description: 'A style per tag name, for every item with that tag. A tag styled here that no item has is a warning.' },
    legend: { type: 'boolean', default: true, description: 'Draw a legend of the item types, styled owners and styled tags used.' },
    tasks: { type: 'array', items: { $ref: '#/$defs/item' }, description: 'Top-level items; each may hold items of its own, to any depth.' },
  },
  $defs: {
    item: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name'],
      properties: {
        id,
        name: { type: 'string', description: 'Shown in the table.' },
        type: { type: 'string', enum: ITEM_TYPES, default: 'task', description: '`task` (a bar), `milestone` (a diamond), `deliverable` (a page), `gate` (a hexagon: an approval), `buffer` (a hatched bar: reserve time) or `external` (a dashed bar: work outside your control). Milestones, deliverables and gates take no time. An item with items inside is a summary.' },
        start: date('Fixed start. The item keeps it even if a link says otherwise (that is a warning).'),
        end: date('Fixed finish. The item keeps it even if a link says otherwise (that is a warning).'),
        duration: { type: 'integer', minimum: 0, maximum: 10000, description: 'Working days. Without it, and without both dates, 1 day is assumed (a warning).' },
        after: {
          type: 'array',
          items: { type: 'string', pattern: LINK_PATTERN },
          description: 'Items this one depends on: `"id"` (finish-to-start), or with a link type and a lag or lead in working days: `"id SS"`, `"id FS+2"`, `"id FF-1"`, `"id SF"`. Links may point at summaries.',
        },
        owner: { type: 'string', description: 'Who does it; shown in the table and matched by `styleBy.owner`.' },
        tags: { type: 'array', items: { type: 'string', minLength: 1 }, description: 'Tag names; each tag styled in `tags` decorates the item, later tags winning.' },
        quote: { type: 'string', description: 'Supporting excerpt from the source material; shown as a tooltip.' },
        style,
        tasks: { type: 'array', items: { $ref: '#/$defs/item' }, description: 'Items inside this one, which makes it a summary spanning them.' },
      },
    },
  },
} as const;
