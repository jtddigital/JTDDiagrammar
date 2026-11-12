import { error, pointer, type Diagnostic } from '../../diagnostics.ts';
import type { GraphIR } from '../../ir/types.ts';
import type { AiAssets, DiagramType, Example } from '../../registry/diagram-type.ts';
import { byId, pick } from '../../ai-merge.ts';
import { styled } from '../section-styles.ts';
import type { OrgChart, Person } from './model.ts';
import { orgchartSchema } from './schema.ts';

/** Reporting lines must form a tree: nobody manages themselves, directly or through others. */
function validate(m: OrgChart): Diagnostic[] {
  const manager = new Map(m.people.map((p) => [p.id, p.manager]));
  return m.people.flatMap((p, i) => {
    const seen = new Set([p.id]);
    for (let x = p.manager; x !== undefined; x = manager.get(x)) {
      if (seen.has(x)) return [error('orgchart.cycle', `'${p.id}' reports to themselves through '${x}'`, pointer('people', i, 'manager'))];
      seen.add(x);
    }
    return [];
  });
}

const toIR = (m: OrgChart): GraphIR => ({
  ...(m.title !== undefined && { title: m.title }),
  ...(m.theme && { theme: m.theme }),
  direction: m.direction ?? 'TB',
  nodes: m.people.map((p, i) => ({ id: p.id, shape: 'card', label: p.title ? `${p.name}\n${p.title}` : p.name, ...styled(m.styles, 'people', p.style), ...pick(p, 'quote'), src: pointer('people', i) })),
  edges: m.people.flatMap((p, i) => (p.manager === undefined ? [] : [{ id: `edge:${i}`, from: p.manager, to: p.id, marker: 'none' as const, ...styled(m.styles, 'lines', undefined), src: pointer('people', i, 'manager') }])),
  containers: [],
});

const examples: [Example, ...Example[]] = [
  {
    name: 'basic',
    title: 'Org chart',
    description: 'People and reporting lines, top to bottom.',
    source: {
      version: '1',
      type: 'orgchart',
      title: 'Product team',
      people: [
        { id: 'ceo', name: 'Avery Chen', title: 'CEO' },
        { id: 'cto', name: 'Sam Patel', title: 'CTO', manager: 'ceo' },
        { id: 'cpo', name: 'Jordan Lee', title: 'Head of Product', manager: 'ceo' },
        { id: 'eng1', name: 'Riley Kim', title: 'Engineer', manager: 'cto' },
        { id: 'eng2', name: 'Morgan Diaz', title: 'Engineer', manager: 'cto' },
        { id: 'pm', name: 'Casey Ford', title: 'Product Manager', manager: 'cpo' },
      ],
    },
  },
];

const ai: AiAssets<OrgChart> = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'people'],
    properties: {
      title: { type: 'string' },
      people: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            title: { type: 'string' },
            manager: { type: 'string', description: 'Id of their manager; omit at the top.' },
            quote: { type: 'string', description: 'Short verbatim excerpt naming this person or role.' },
          },
        },
      },
    },
  },
  fromGenerated: (g) => {
    const { title, people } = g as { title: string; people: Person[] };
    return { version: '1', type: 'orgchart', title, people };
  },
  toGenerated: (m) => ({ title: m.title ?? '', people: m.people.map((p) => pick(p, 'id', 'name', 'title', 'manager', 'quote')) }),
  // Restore theme, direction and styles by person id.
  merge: (prev, next) => {
    const people = byId(prev.people);
    return { ...next, ...pick(prev, 'theme', 'direction', 'styles'), people: next.people.map((p) => ({ ...p, ...pick(people.get(p.id) ?? ({} as Person), 'style') })) };
  },
  guide: `Diagram type: orgchart.
- One entry per person or role named in the material; "name" is the person (or the role if no name is given), "title" their role.
- "manager" is the id of who they report to. Exactly the people at the top have no manager.
- Do not invent people or reporting lines that the material does not state.
- Where the material names a person or role directly, set "quote" to a short verbatim excerpt (at most 20 words).`,
  examples: [
    {
      input: 'Dana leads the clinic. Two nurses, Eli and Fay, report to Dana.',
      output: { title: 'Clinic', people: [{ id: 'dana', name: 'Dana', title: 'Clinic lead' }, { id: 'eli', name: 'Eli', title: 'Nurse', manager: 'dana' }, { id: 'fay', name: 'Fay', title: 'Nurse', manager: 'dana' }] },
    },
  ],
};

/** Org chart (URS-TYP-006): a third type, built only from the plugin contract. */
export const orgchart: DiagramType<OrgChart> = {
  id: 'orgchart',
  title: 'Org chart',
  description: 'People and who they report to. For teams and organisations.',
  schema: orgchartSchema,
  engine: 'layered',
  validate,
  toIR,
  examples,
  ai,
};
