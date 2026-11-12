import type { Style } from '../ir/types.ts';

/** Diagram-level default style per section, e.g. `{ nodes: {...}, lanes: {...} }` (URS-DM-015). */
export type SectionStyles = Readonly<Record<string, Style | undefined>>;

/** An item's own style over a default, field by field; undefined when neither is set. */
export const merged = (base: Style | undefined, own: Style | undefined): Style | undefined => (base || own ? { ...base, ...own } : undefined);

/** `{ style }` for spreading into an IR element, or nothing. */
export const over = (base: Style | undefined, own: Style | undefined) => {
  const s = merged(base, own);
  return s ? { style: s } : {};
};

/** `over` with the default taken from a section of `styles`. */
export const styled = (styles: SectionStyles | undefined, section: string, own: Style | undefined) => over(styles?.[section], own);
