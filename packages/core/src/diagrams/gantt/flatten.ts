import { pointer } from '../../diagnostics.ts';
import type { Item } from './model.ts';

/** An item in table order, with where it sits in the tree (URS-TYP-015). */
export interface Row {
  item: Item;
  path: string;
  depth: number;
  parent?: Row;
  children: Row[];
  /** Outline number, e.g. `1.2.3`. */
  wbs: string;
}

/** Items depth first, as the table lists them. */
export function flatten(items: readonly Item[]): Row[] {
  const out: Row[] = [];
  const walk = (list: readonly Item[], base: (string | number)[], parent: Row | undefined, depth: number) =>
    list.forEach((item, i) => {
      const row: Row = { item, path: pointer(...base, i), depth, ...(parent && { parent }), children: [], wbs: parent ? `${parent.wbs}.${i + 1}` : `${i + 1}` };
      parent?.children.push(row);
      out.push(row);
      if (item.tasks?.length) walk(item.tasks, [...base, i, 'tasks'], row, depth + 1);
    });
  walk(items, ['tasks'], undefined, 0);
  return out;
}

/** The items with no items inside, under `row` (itself if it has none). */
export const leavesOf = (row: Row): Row[] => (row.children.length ? row.children.flatMap(leavesOf) : [row]);

/** Whether `a` is `b` or contains it. */
export const contains = (a: Row, b: Row): boolean => {
  for (let x: Row | undefined = b; x; x = x.parent) if (x === a) return true;
  return false;
};
