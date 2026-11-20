import type { EditAssets } from '../../registry/diagram-type.ts';
import type { Gantt, Item } from './model.ts';

/** Where an item sits in the source, at any depth. */
function find(items: readonly Item[], id: string, at = ''): { item: Item; at: string } | undefined {
  for (const [i, t] of items.entries()) {
    const here = `${at}/tasks/${i}`;
    if (t.id === id) return { item: t, at: here };
    const inner = t.tasks && find(t.tasks, id, here);
    if (inner) return inner;
  }
  return undefined;
}

/** Toolbar editing (URS-EXT-012): tasks and milestones at the top level; connecting A to B makes B start after A. */
export const ganttEdit: EditAssets<Gantt> = {
  add: [
    { label: 'Task', make: (id) => ({ at: '/tasks', append: true, value: { id, name: 'New task', duration: 2 } }) },
    { label: 'Milestone', make: (id) => ({ at: '/tasks', append: true, value: { id, name: 'New milestone', type: 'milestone' } }) },
  ],
  connect: (m, from, to) => {
    const b = find(m.tasks, to);
    if (from === to || !b || !find(m.tasks, from) || b.item.after?.some((a) => a.split(/\s/)[0] === from)) return undefined;
    return { at: `${b.at}/after`, append: true, value: from };
  },
};
