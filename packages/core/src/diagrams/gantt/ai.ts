import type { AiAssets } from '../../registry/diagram-type.ts';
import { ITEM_TYPES, type Gantt, type Item } from './model.ts';

interface Flat {
  id: string;
  name: string;
  type?: string;
  parent?: string;
  duration?: number;
  after?: string[];
  start?: string;
  end?: string;
  owner?: string;
}

/** Flat items with `parent` refs, nested back into a tree; a parent that is missing or loops is dropped. */
function nest(items: Flat[]): Item[] {
  const byId = new Map(items.map((f) => [f.id, f]));
  const parentOf = (f: Flat) => {
    const seen = new Set([f.id]);
    for (let p = f.parent; p !== undefined; p = byId.get(p)?.parent) {
      if (seen.has(p) || !byId.has(p)) return undefined;
      seen.add(p);
    }
    return f.parent;
  };
  const kids = new Map<string | undefined, Flat[]>();
  for (const f of items) kids.set(parentOf(f), [...(kids.get(parentOf(f)) ?? []), f]);
  const build = (f: Flat): Item => {
    const inside = kids.get(f.id) ?? [];
    const after = (f.after ?? []).filter((a) => a.trim() !== '');
    return {
      id: f.id,
      name: f.name,
      ...(f.type && (ITEM_TYPES as readonly string[]).includes(f.type) && f.type !== 'task' && { type: f.type as Item['type'] }),
      ...(f.start && { start: f.start }),
      ...(f.end && { end: f.end }),
      ...(f.duration !== undefined && { duration: Math.min(10000, Math.max(0, Math.round(f.duration))) }),
      ...(after.length && { after }),
      ...(f.owner && { owner: f.owner }),
      ...(inside.length && { tasks: inside.map(build) }),
    };
  };
  return (kids.get(undefined) ?? []).map(build);
}

export const ai: AiAssets<Gantt> = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'start', 'items'],
    properties: {
      title: { type: 'string' },
      start: { type: 'string', description: 'Project start, YYYY-MM-DD.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: [...ITEM_TYPES] },
            parent: { type: 'string', description: 'Id of the item this one sits inside (a phase or work package); omit at the top.' },
            duration: { type: 'integer', description: 'Working days; omit for milestones, deliverables and gates.' },
            after: { type: 'array', items: { type: 'string' }, description: 'Predecessors: "id" (finish-to-start) or "id SS", "id FF", "id SF", with an optional lag or lead in days, e.g. "id FS+2".' },
            start: { type: 'string', description: 'Only if the material fixes it: YYYY-MM-DD.' },
            end: { type: 'string', description: 'Only if the material fixes it: YYYY-MM-DD.' },
            owner: { type: 'string', description: 'Person, team or role responsible.' },
          },
        },
      },
    },
  },
  fromGenerated: (g) => {
    const { title, start, items } = g as { title: string; start: string; items: Flat[] };
    return { version: '1', type: 'gantt', title, start, tasks: nest(items) };
  },
  guide: `Diagram type: gantt.
- One item per task, milestone, deliverable or approval named in the material; group them with "parent" into the phases or work packages the material describes (any depth). Phases get no duration: they span their items.
- "duration" is in working days. Milestones, deliverables and gates (approvals that hold back what follows) take no time.
- Link items with "after" as the material states: finish-to-start by default; "SS", "FF", "SF" and lags such as "+2" only when the material says so. Do not invent dependencies.
- Use "start"/"end" only for dates the material fixes; otherwise let links decide.
- "type": "external" for work done outside the team (vendors, regulators), "buffer" for reserve time.`,
  examples: [
    {
      input: 'Kick-off on 4 Jan 2027. Design takes two weeks, then build three weeks. Testing starts a week into build and ends with it. Launch when testing is done.',
      output: {
        title: 'Project plan',
        start: '2027-01-04',
        items: [
          { id: 'design', name: 'Design', duration: 10 },
          { id: 'build', name: 'Build', duration: 15, after: ['design'] },
          { id: 'test', name: 'Testing', duration: 10, after: ['build SS+5', 'build FF'] },
          { id: 'launch', name: 'Launch', type: 'milestone', after: ['test'] },
        ],
      },
    },
  ],
};
