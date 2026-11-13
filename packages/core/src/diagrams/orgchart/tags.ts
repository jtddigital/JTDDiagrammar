import { pointer, warning, type Diagnostic } from '../../diagnostics.ts';
import type { Style } from '../../ir/types.ts';
import { merged } from '../section-styles.ts';
import type { OrgChart, Person } from './model.ts';

/** The styles of a person's tags, merged in the order the person lists them (later wins) (URS-TYP-013). */
export const tagStyle = (m: Pick<OrgChart, 'tags'>, p: Pick<Person, 'tags'>): Style | undefined => (p.tags ?? []).reduce<Style | undefined>((s, t) => merged(s, m.tags?.[t]), undefined);

/** A tag styled in `tags` that no one wears is a warning: likely a typo or left over. */
export function checkTags(m: OrgChart): Diagnostic[] {
  const worn = new Set(m.people.flatMap((p) => p.tags ?? []));
  return Object.keys(m.tags ?? {})
    .filter((t) => !worn.has(t))
    .map((t) => warning('orgchart.tag', `tag '${t}' is styled in \`tags\` but no one has it`, pointer('tags', t)));
}
