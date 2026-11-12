import type { Style } from '../ir/types.ts';

/** Diagram-level default style per section, e.g. `{ nodes: {...}, lanes: {...} }` (URS-DM-015). */
export type SectionStyles = Readonly<Record<string, Style | undefined>>;

/** Style rules keyed by an attribute and its value, e.g. `{ owner: { Bill: {...} } }` (URS-DM-023). */
export type StyleBy<K extends string> = Partial<Record<K, Readonly<Record<string, Style>>>>;

/** The rules matching an item, merged in the order of `keys` (later wins); undefined when none match. */
export const ruled = <K extends string>(by: StyleBy<K> | undefined, keys: Partial<Record<K, string>>): Style | undefined =>
  (Object.entries(keys) as [K, string | undefined][]).reduce<Style | undefined>((s, [k, v]) => (v === undefined ? s : merged(s, by?.[k]?.[v])), undefined);

/** An item's own style over a default, field by field; undefined when neither is set. */
export const merged = (base: Style | undefined, own: Style | undefined): Style | undefined => (base || own ? { ...base, ...own } : undefined);

/** `{ style }` for spreading into an IR element, or nothing. */
export const over = (base: Style | undefined, own: Style | undefined) => {
  const s = merged(base, own);
  return s ? { style: s } : {};
};

/** `over` with the default taken from a section of `styles`. */
export const styled = (styles: SectionStyles | undefined, section: string, own: Style | undefined) => over(styles?.[section], own);
