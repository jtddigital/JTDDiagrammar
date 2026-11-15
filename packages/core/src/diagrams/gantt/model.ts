import type { Style, Theme } from '../../ir/types.ts';
import type { Weekday } from './dates.ts';

/** What an item is (URS-TYP-015). An item with `tasks` inside is a summary, whatever its type. */
export const ITEM_TYPES = ['task', 'milestone', 'deliverable', 'gate', 'buffer', 'external'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
/** Types that mark a moment rather than take time. */
export const POINT_TYPES: readonly ItemType[] = ['milestone', 'deliverable', 'gate'];

export const COLUMNS = ['wbs', 'name', 'owner', 'start', 'end', 'duration'] as const;
export type Column = (typeof COLUMNS)[number];

export interface Item {
  id: string;
  name: string;
  type?: ItemType;
  /** Fixed dates (`YYYY-MM-DD`): the item keeps them, and a dependency they break is a warning (URS-TYP-016). */
  start?: string;
  end?: string;
  /** Working days. */
  duration?: number;
  /** Predecessors: `"id"`, or with a link type and lag, e.g. `"id SS"`, `"id FS+2"`, `"id FF-1"` (days). */
  after?: string[];
  owner?: string;
  tags?: string[];
  quote?: string;
  style?: Style;
  /** Items inside this one, which makes it a summary (any depth). */
  tasks?: Item[];
}

export interface Gantt {
  version: string;
  type: 'gantt';
  title?: string;
  theme?: Theme;
  /** Project start (`YYYY-MM-DD`): unfixed items start no earlier. */
  start: string;
  /** Finishing after this date is a warning; drawn as a line. */
  deadline?: string;
  calendar?: { workdays?: Weekday[]; holidays?: string[] };
  /** Table columns left of the chart, in order. */
  columns?: Column[];
  /** Default style for every item and every dependency line (URS-DM-015). */
  styles?: Partial<Record<'tasks' | 'links', Style>>;
  /** Styles by item type and by owner (URS-TYP-017). */
  styleBy?: { type?: Partial<Record<ItemType | 'summary', Style>>; owner?: Record<string, Style> };
  /** A style per tag, for every item with that tag (URS-TYP-017). */
  tags?: Record<string, Style>;
  legend?: boolean;
  tasks: Item[];
}

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';
export interface Link {
  task: string;
  type: LinkType;
  /** Days; negative is a lead. */
  lag: number;
}

const LINK = /^\s*([A-Za-z_][A-Za-z0-9_.-]*)(?:\s+(FS|SS|FF|SF))?\s*(?:([+-]\s*\d+)\s*d?)?\s*$/;
export const LINK_PATTERN = LINK.source;

/** `"id FS+2"` → a link; undefined when it does not parse. */
export function parseLink(s: string): Link | undefined {
  const m = LINK.exec(s);
  return m ? { task: m[1]!, type: (m[2] as LinkType | undefined) ?? 'FS', lag: m[3] ? Number(m[3].replace(/\s/g, '')) : 0 } : undefined;
}
