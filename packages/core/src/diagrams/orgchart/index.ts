import { error, pointer, type Diagnostic } from '../../diagnostics.ts';
import type { GraphIR } from '../../ir/types.ts';
import type { AiAssets, DiagramType, Example } from '../../registry/diagram-type.ts';
import { merged, styled } from '../section-styles.ts';
import { checkDepartments, departmentsOf, loopOf } from './departments.ts';
import { teamStacks } from './compact.ts';
import { type OrgChart, type Person } from './model.ts';
import { checkTags, tagLegend, tagStyle } from './tags.ts';
import { orgchartSchema } from './schema.ts';

/** Reporting lines must form a tree: nobody manages themselves, directly or through others. */
function validate(m: OrgChart): Diagnostic[] {
  const manager = new Map(m.people.map((p) => [p.id, p.manager]));
  const cycles = m.people.flatMap((p, i) => {
    const seen = new Set([p.id]);
    for (let x = p.manager; x !== undefined; x = manager.get(x)) {
      if (seen.has(x)) return [error('orgchart.cycle', `'${p.id}' reports to themselves through '${x}'`, pointer('people', i, 'manager'))];
      seen.add(x);
    }
    return [];
  });
  return [...cycles, ...(cycles.length ? [] : checkDepartments(m)), ...checkTags(m)];
}

const toIR = (m: OrgChart): GraphIR => {
  const depts = departmentsOf(m);
  const legend = tagLegend(m);
  const stacks = teamStacks(m);
  const idOf = new Map(depts.map((d) => [d.name, d.id]));
  // A circular parent is reported by the rules; the boxes simply aren't nested.
  const parentOf = new Map(depts.map((d) => [d.name, d.entry?.parent]));
  const nestIn = (d: (typeof depts)[number]) => (d.entry?.parent !== undefined && idOf.has(d.entry.parent) && !loopOf(d.name, parentOf) ? idOf.get(d.entry.parent) : undefined);
  return {
  ...(m.title !== undefined && { title: m.title }),
  ...(m.theme && { theme: m.theme }),
  direction: m.direction ?? 'TB',
  ...(m.compact && { compact: m.compact }),
  nodes: m.people.map((p, i) => {
    const stack = stacks.get(p.id);
    return {
      id: p.id,
      shape: 'card',
      label: p.title ? `${p.name}\n${p.title}` : p.name,
      // Section default, then tags, then the person's own style (URS-DM-015, URS-TYP-013).
      ...styled(m.styles, 'people', merged(tagStyle(m, p), p.style)),
      ...(p.quote !== undefined && { quote: p.quote }),
      ...(stack !== undefined && { stack }),
      ...(p.department !== undefined && { parent: idOf.get(p.department)! }),
      src: pointer('people', i),
    };
  }),
  edges: m.people.flatMap((p, i) => (p.manager === undefined ? [] : [{ id: `edge:${i}`, from: p.manager, to: p.id, marker: 'none' as const, ...styled(m.styles, 'lines', undefined), src: pointer('people', i, 'manager') }])),
  // One box per department (URS-TYP-012).
  containers: depts.map((d) => ({
    id: d.id,
    label: d.name,
    ...(nestIn(d) !== undefined && { parent: nestIn(d)! }),
    ...styled(m.styles, 'departments', d.entry?.style),
    src: d.src,
  })),
  ...(legend.length && { legend }),
  };
};

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
  {
    name: 'stacked',
    title: 'Org chart, stacked teams',
    description: '`stack: true`: each team hangs in a column under its manager. The leadership team keeps its row with `stack: false` on its manager.',
    source: {
      version: '1',
      type: 'orgchart',
      title: 'Engineering',
      stack: true,
      people: [
        { id: 'vp', name: 'Avery Chen', title: 'VP Engineering', stack: false },
        { id: 'web', name: 'Sam Patel', title: 'Web lead', manager: 'vp' },
        { id: 'app', name: 'Jordan Lee', title: 'Mobile lead', manager: 'vp' },
        { id: 'ops', name: 'Riley Kim', title: 'Platform lead', manager: 'vp' },
        { id: 'w1', name: 'Morgan Diaz', title: 'Frontend engineer', manager: 'web' },
        { id: 'w2', name: 'Casey Ford', title: 'Frontend engineer', manager: 'web' },
        { id: 'w3', name: 'Quinn Ross', title: 'Designer', manager: 'web' },
        { id: 'a1', name: 'Drew Park', title: 'iOS engineer', manager: 'app' },
        { id: 'a2', name: 'Jamie Cole', title: 'Android engineer', manager: 'app' },
        { id: 'o1', name: 'Taylor Wu', title: 'SRE', manager: 'ops' },
        { id: 'o2', name: 'Alex Moore', title: 'SRE', manager: 'ops' },
        { id: 'o3', name: 'Sky Rivera', title: 'Security engineer', manager: 'ops' },
        { id: 'o4', name: 'Robin Hale', title: 'DBA', manager: 'ops' },
      ],
    },
  },
  {
    name: 'departments',
    title: 'Org chart, departments',
    description: '`department` on each person boxes everyone in it; `departments` styles the boxes and nests Product Design inside Product.',
    source: {
      version: '1',
      type: 'orgchart',
      title: 'Acme',
      stack: true,
      styles: { departments: { fill: '#f8fafc' } },
      departments: [
        { name: 'Engineering', style: { fill: '#eff6ff', stroke: '#93c5fd' } },
        { name: 'Product', style: { fill: '#f0fdf4', stroke: '#86efac' } },
        { name: 'Product Design', parent: 'Product' },
      ],
      people: [
        { id: 'ceo', name: 'Avery Chen', title: 'CEO', stack: false },
        { id: 'cto', name: 'Sam Patel', title: 'CTO', manager: 'ceo', department: 'Engineering' },
        { id: 'e1', name: 'Riley Kim', title: 'Engineer', manager: 'cto', department: 'Engineering' },
        { id: 'e2', name: 'Morgan Diaz', title: 'Engineer', manager: 'cto', department: 'Engineering' },
        { id: 'cpo', name: 'Jordan Lee', title: 'Head of Product', manager: 'ceo', department: 'Product', stack: false },
        { id: 'pm', name: 'Casey Ford', title: 'Product Manager', manager: 'cpo', department: 'Product' },
        { id: 'dl', name: 'Quinn Ross', title: 'Design lead', manager: 'cpo', department: 'Product Design' },
        { id: 'd1', name: 'Drew Park', title: 'Designer', manager: 'dl', department: 'Product Design' },
      ],
    },
  },
  {
    name: 'multi',
    title: 'Org chart, a team in two columns',
    description: '`multi: 2` on a manager: their team is stacked in two columns.',
    source: {
      version: '1',
      type: 'orgchart',
      title: 'Customer support',
      people: [
        { id: 'lead', name: 'Avery Chen', title: 'Head of Support', multi: 2 },
        { id: 's1', name: 'Sam Patel', title: 'Agent', manager: 'lead' },
        { id: 's2', name: 'Jordan Lee', title: 'Agent', manager: 'lead' },
        { id: 's3', name: 'Riley Kim', title: 'Agent', manager: 'lead' },
        { id: 's4', name: 'Morgan Diaz', title: 'Agent', manager: 'lead' },
        { id: 's5', name: 'Casey Ford', title: 'Senior agent', manager: 'lead' },
        { id: 's6', name: 'Quinn Ross', title: 'Team coach', manager: 'lead' },
      ],
    },
  },
  {
    name: 'tags',
    title: 'Org chart, tags',
    description: '`tags` on people, styled once at the top: contractors dashed, open roles faded. A person\'s own `style` still wins.',
    source: {
      version: '1',
      type: 'orgchart',
      title: 'Platform team',
      tags: {
        contractor: { dash: 'dashed', fill: '#fff7ed', stroke: '#f97316' },
        open: { opacity: 0.55, italic: true },
        remote: { stroke: '#2563eb', lineWidth: 2 },
      },
      people: [
        { id: 'lead', name: 'Avery Chen', title: 'Platform lead' },
        { id: 'p1', name: 'Sam Patel', title: 'Engineer', manager: 'lead', tags: ['remote'] },
        { id: 'p2', name: 'Riley Kim', title: 'Engineer', manager: 'lead', tags: ['contractor', 'remote'] },
        { id: 'p3', name: 'Morgan Diaz', title: 'SRE', manager: 'lead', tags: ['contractor'], style: { fill: '#ecfdf5' } },
        { id: 'p4', name: 'Open role', title: 'Engineer', manager: 'lead', tags: ['open'] },
      ],
    },
  },
  {
    name: 'compact',
    title: 'Org chart, saving space',
    description: '`compact: "both"`: teams whose members manage no one become balanced grids, with tighter spacing. `horizontal` or `vertical` saves one way only.',
    source: {
      version: '1',
      type: 'orgchart',
      title: 'Operations',
      compact: 'both',
      people: [
        { id: 'coo', name: 'Avery Chen', title: 'COO' },
        { id: 'sup', name: 'Sam Patel', title: 'Support lead', manager: 'coo' },
        ...['Riley Kim', 'Morgan Diaz', 'Casey Ford', 'Quinn Ross', 'Drew Park', 'Jordan Lee'].map((name, i) => ({ id: `s${i}`, name, title: 'Agent', manager: 'sup' })),
        { id: 'log', name: 'Blake Ross', title: 'Logistics lead', manager: 'coo' },
        ...['Cass Lee', 'Dana Moe', 'Eli Shaw', 'Fay Wu'].map((name, i) => ({ id: `l${i}`, name, title: 'Coordinator', manager: 'log' })),
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
            department: { type: 'string', description: 'Department name, spelt the same for everyone in it. People with the same department are drawn in one labelled box.' },
            quote: { type: 'string', description: 'Short verbatim excerpt naming this person or role.' },
          },
        },
      },
    },
  },
  fromGenerated: (g) => {
    const { title, people } = g as { title: string; people: Person[] };
    // An empty department means none.
    return { version: '1', type: 'orgchart', title, people: people.map(({ department, ...p }) => (department ? { ...p, department } : p)) };
  },
  guide: `Diagram type: orgchart.
- One entry per person or role named in the material; "name" is the person (or the role if no name is given), "title" their role.
- "manager" is the id of who they report to. Exactly the people at the top have no manager.
- Do not invent people or reporting lines that the material does not state.
- Department boxes: give each person "department" with their department's name, spelt exactly the same for everyone in it; everyone with that name is boxed together under that label. A department needs no head: its manager may be in another department, or its people may report to different managers. Leave "department" out where the material gives none; never move people or invent a head to fill a department.
- Where the material names a person or role directly, set "quote" to a short verbatim excerpt (at most 20 words).`,
  examples: [
    {
      input: 'Dana leads the clinic. Two nurses, Eli and Fay, report to Dana.',
      output: { title: 'Clinic', people: [{ id: 'dana', name: 'Dana', title: 'Clinic lead' }, { id: 'eli', name: 'Eli', title: 'Nurse', manager: 'dana' }, { id: 'fay', name: 'Fay', title: 'Nurse', manager: 'dana' }] },
    },
    {
      input: 'Gale, the finance director, runs Finance. Hal and Ivy work in Payroll and report to Gale.',
      output: {
        title: 'Finance',
        people: [
          { id: 'gale', name: 'Gale', title: 'Finance director', department: 'Finance' },
          { id: 'hal', name: 'Hal', manager: 'gale', department: 'Payroll' },
          { id: 'ivy', name: 'Ivy', manager: 'gale', department: 'Payroll' },
        ],
      },
    },
  ],
};

/** Org chart (URS-TYP-006): a third type, built only from the plugin contract. */
export const orgchart: DiagramType<OrgChart> = {
  id: 'orgchart',
  title: 'Org chart',
  description: 'People and who they report to. For teams and organisations.',
  schema: orgchartSchema,
  engine: 'tree',
  validate,
  toIR,
  examples,
  ai,
};
