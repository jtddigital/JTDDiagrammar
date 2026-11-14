import { stacksOf, type OrgChart } from './model.ts';

/**
 * How many stacks each person's team takes (URS-TYP-011, URS-TYP-014). Without `compact`, as the chart
 * and the person set it. With `compact`, the layout chooses each team's arrangement to save space, so
 * the chart's own `stack` and `multi` give way; a person's own `stack` or `multi` still wins (0 keeps a row).
 */
export function teamStacks(m: OrgChart): Map<string, number | undefined> {
  return new Map(
    m.people.map((p) => {
      if (!m.compact) return [p.id, stacksOf(m, p)];
      if (p.multi !== undefined) return [p.id, p.multi];
      if (p.stack !== undefined) return [p.id, p.stack ? 1 : 0];
      return [p.id, undefined];
    }),
  );
}
