import { pointer, warning, type Diagnostic } from '../../diagnostics.ts';
import type { LegendItem, Style } from '../../ir/types.ts';
import { merged } from '../section-styles.ts';
import type { Placed } from './schedule.ts';
import type { Gantt, ItemType } from './model.ts';

export type Kind = ItemType | 'summary';
export const kindOf = (r: Pick<Placed, 'summary' | 'item'>): Kind => (r.summary ? 'summary' : (r.item.type ?? 'task'));
export const SHAPE: Record<Kind, string> = { task: 'task', summary: 'summary', milestone: 'milestone', deliverable: 'deliverable', gate: 'gate', buffer: 'buffer', external: 'task' };
const NAME: Record<Kind, string> = { task: 'Task', summary: 'Summary', milestone: 'Milestone', deliverable: 'Deliverable', gate: 'Gate', buffer: 'Buffer', external: 'External' };
/** Looks a type has before any style is set. */
const BUILT_IN: Partial<Record<Kind, Style>> = { external: { dash: 'dashed' } };

/** The style of a kind before owner and tags: built in, then `styles.tasks`, then `styleBy.type`. */
const kindStyle = (m: Gantt, k: Kind) => merged(merged(BUILT_IN[k], m.styles?.tasks), m.styleBy?.type?.[k]);

/** An item's style (URS-TYP-017): its kind, then its owner, then its tags in order, then its own. */
export function itemStyle(m: Gantt, r: Placed): Style | undefined {
  let s = kindStyle(m, kindOf(r));
  if (r.item.owner !== undefined) s = merged(s, m.styleBy?.owner?.[r.item.owner]);
  for (const t of r.item.tags ?? []) s = merged(s, m.tags?.[t]);
  return merged(s, r.item.style);
}

/**
 * The legend (URS-DM-026): the kinds used when there is more than one, then each styled owner and each
 * styled tag that an item has, each sample drawn in its style.
 */
export function legendOf(m: Gantt, rows: readonly Placed[]): LegendItem[] {
  if (m.legend === false) return [];
  const kinds = [...new Set(rows.map(kindOf))];
  const out: LegendItem[] = kinds.length > 1 ? kinds.map((k) => ({ label: NAME[k], shape: SHAPE[k], ...withStyle(kindStyle(m, k)) })) : [];
  const owners = new Set(rows.flatMap((r) => (r.item.owner === undefined ? [] : [r.item.owner])));
  for (const [o, s] of Object.entries(m.styleBy?.owner ?? {})) if (owners.has(o)) out.push({ label: o, shape: 'task', ...withStyle(merged(kindStyle(m, 'task'), s)) });
  const tags = new Set(rows.flatMap((r) => r.item.tags ?? []));
  for (const [t, s] of Object.entries(m.tags ?? {})) if (tags.has(t)) out.push({ label: t, shape: 'task', ...withStyle(merged(kindStyle(m, 'task'), s)) });
  return out;
}
const withStyle = (s: Style | undefined) => (s ? { style: s } : {});

/** A tag styled in `tags` that no item has is a warning. */
export function checkTags(m: Gantt, rows: readonly Placed[]): Diagnostic[] {
  const worn = new Set(rows.flatMap((r) => r.item.tags ?? []));
  return Object.keys(m.tags ?? {})
    .filter((t) => !worn.has(t))
    .map((t) => warning('gantt.tag', `tag '${t}' is styled in \`tags\` but no item has it`, pointer('tags', t)));
}
