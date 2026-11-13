import type { GraphIR } from '@jtd/core';
import { applyEdits, getLocation, modify } from 'jsonc-parser';

/**
 * Diagram ↔ source links for the interactive preview (URS-WEB-020). Everything goes through the
 * IR's source pointers and labels, so there is no type-specific code (URS-WEB-010).
 */
export interface Ref {
  kind: string;
  id: string;
}

interface Item {
  id: string;
  src?: string;
  label?: string;
  labels?: { text: string }[];
}

/** Drawn elements by SVG id prefix (URS-RN-005). */
export const kinds = (ir: GraphIR): [string, Item[]][] => {
  const p = ir.partitions;
  return [['n', ir.nodes], ['c', ir.containers], ['e', ir.edges], ['l', p?.lanes ?? []], ['p', p?.phases ?? []], ['lg', p?.laneGroups ?? []], ['pg', p?.phaseGroups ?? []]];
};

const item = (ir: GraphIR, r: Ref) => kinds(ir).find(([k]) => k === r.kind)?.[1].find((x) => x.id === r.id);

const under = (path: string, src: string) => path === src || path.startsWith(`${src}/`);

/** JSON Pointer of the value at `offset` in `text`. */
export const pointerAt = (text: string, offset: number) =>
  getLocation(text, offset).path.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');

/** The drawn element whose source holds `pointer`: the deepest one, e.g. an edge inside its node. */
export function elementAt(ir: GraphIR, pointer: string): Ref | undefined {
  let best: (Ref & { depth: number }) | undefined;
  for (const [kind, list] of kinds(ir))
    for (const x of list) if (x.src && under(pointer, x.src) && (!best || x.src.length > best.depth)) best = { kind, id: x.id, depth: x.src.length };
  return best && { kind: best.kind, id: best.id };
}

/** SVG ids of the edges touching a node. */
export const related = (ir: GraphIR, r: Ref): string[] => (r.kind === 'n' ? ir.edges.filter((e) => e.from === r.id || e.to === r.id).map((e) => `e-${e.id}`) : []);

const at = (v: unknown, pointer: string): unknown =>
  pointer
    .split('/')
    .slice(1)
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), v);

/** Properties that usually hold the shown text, tried first when several match. */
const PREFERRED = ['label', 'name', 'title', 'text'];

/**
 * Where the shown label of an element lives in the source: a string property of its source object
 * holding exactly that text (whatever the type calls it), or its first `labels` entry. An element
 * showing its id, with no label property, gets one. Undefined when the label is computed.
 */
export function labelTarget(ir: GraphIR, value: unknown, r: Ref): { path: string; text: string } | undefined {
  const x = item(ir, r);
  const obj = x?.src ? at(value, x.src) : undefined;
  if (!x?.src || !obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  const o = obj as Record<string, unknown>;
  const shown = x.label ?? x.labels?.[0]?.text;
  if (shown === undefined) return undefined;
  const rank = (k: string) => (PREFERRED.indexOf(k) + PREFERRED.length + 1) % (PREFERRED.length + 1);
  const key = Object.keys(o)
    .filter((k) => k !== 'id' && o[k] === shown)
    .sort((a, b) => rank(a) - rank(b))[0];
  if (key) return { path: `${x.src}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, text: shown };
  const first = (o.labels as { text?: unknown }[] | undefined)?.[0];
  if (first?.text === shown) return { path: `${x.src}/labels/0/text`, text: shown };
  if (shown === o.id && !('label' in o)) return { path: `${x.src}/label`, text: shown };
  return undefined;
}

/** `text` with the value at `pointer` set, keeping the rest of the formatting. */
export function setAt(text: string, pointer: string, value: string): string {
  const path = pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  return applyEdits(text, modify(text, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
}
