import type { Direction, Style, Theme } from '../../ir/types.ts';

export interface Person {
  id: string;
  name: string;
  title?: string;
  /** Id of this person's manager; omitted at the top. */
  manager?: string;
  quote?: string;
  style?: Style;
  /** This person's team: stacked (`true`) or in a row (`false`); default the chart's (URS-TYP-011). */
  stack?: boolean;
  /** This person's team stacked in this many columns (rows when the chart runs left to right). */
  multi?: number;
  /** Department name: everyone in one department is drawn inside one box (URS-TYP-012). */
  department?: string;
  /** Tags whose styles (from the chart's `tags`) decorate this person, in order (URS-TYP-013). */
  tags?: string[];
}

/** A department's box: its style, and the department it sits inside. */
export interface Department {
  name: string;
  parent?: string;
  style?: Style;
}

export interface OrgChart {
  version: string;
  type: 'orgchart';
  title?: string;
  theme?: Theme;
  direction?: Direction;
  /** Default style for people and for reporting lines (URS-DM-015). */
  styles?: Partial<Record<'people' | 'lines' | 'departments', Style>>;
  /** Optional: styles and nesting for departments named on people (URS-TYP-012). */
  departments?: Department[];
  /** A style per tag, for every person with that tag; a person's own `style` wins (URS-TYP-013). */
  tags?: Record<string, Style>;
  /** Stack each team under its manager instead of spreading it in a row (URS-TYP-011). */
  stack?: boolean;
  /** Split each stacked team into this many columns (rows when left to right). Implies `stack`. */
  multi?: number;
  people: Person[];
}

/** How many stacks a person's team is laid out in; undefined for a row. A person's own setting wins. */
export function stacksOf(m: Pick<OrgChart, 'stack' | 'multi'>, p: Pick<Person, 'stack' | 'multi'>): number | undefined {
  if (p.multi !== undefined) return p.multi;
  if (p.stack === false) return undefined;
  return p.stack || m.stack || m.multi !== undefined ? (m.multi ?? 1) : undefined;
}
