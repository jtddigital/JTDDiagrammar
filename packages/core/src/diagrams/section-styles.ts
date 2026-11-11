import type { Style } from '../ir/types.ts';

/** Diagram-level default style per section, e.g. `{ nodes: {...}, edges: {...} }` (URS-DM-015). */
export type SectionStyles = Readonly<Record<string, Style | undefined>>;

/** An object's own style over its section's default, field by field; undefined when neither is set. */
export function styleOf(styles: SectionStyles | undefined, section: string, own: Style | undefined): Style | undefined {
  const base = styles?.[section];
  return base || own ? { ...base, ...own } : undefined;
}

/** `{ style }` for spreading into an IR element, or nothing. */
export const styled = (styles: SectionStyles | undefined, section: string, own: Style | undefined) => {
  const s = styleOf(styles, section, own);
  return s ? { style: s } : {};
};
