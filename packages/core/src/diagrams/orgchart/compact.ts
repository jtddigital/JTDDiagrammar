import type { Compact } from '../../ir/types.ts';
import { stacksOf, type OrgChart, type Person } from './model.ts';

/**
 * How many stacks each person's team takes, saving space as `compact` asks (URS-TYP-014). Teams spread
 * along the sibling axis (across, top to bottom; down, left to right): saving there stacks teams whose
 * members manage no one. Stacks grow along the other axis: saving there spreads them into balanced
 * columns. Settings on a person, or `multi` on the chart, always win.
 */
export function teamStacks(m: OrgChart): Map<string, number | undefined> {
  const reports = new Map<string, string[]>();
  for (const p of m.people) if (p.manager !== undefined) reports.set(p.manager, [...(reports.get(p.manager) ?? []), p.id]);
  const has = (axis: Compact) => m.compact === 'both' || m.compact === axis;
  const across = has(m.direction === 'LR' ? 'vertical' : 'horizontal');
  const along = has(m.direction === 'LR' ? 'horizontal' : 'vertical');
  const grid = (n: number) => Math.ceil(Math.sqrt(n));
  return new Map(
    m.people.map((p: Person) => {
      const base = stacksOf(m, p);
      const team = reports.get(p.id) ?? [];
      if (!m.compact || !team.length || p.stack !== undefined || p.multi !== undefined) return [p.id, base];
      if (base === undefined) return [p.id, across && team.every((r) => !reports.has(r)) ? (along ? grid(team.length) : 1) : undefined];
      return [p.id, along && m.multi === undefined ? Math.max(base, grid(team.length)) : base];
    }),
  );
}
