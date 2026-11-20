import type { SourceEdit } from '@jtd/core';
import { applyEdits, modify, type JSONPath } from 'jsonc-parser';

/** Editing source text by JSON Pointer, keeping its formatting (URS-WEB-025, WEB-026). */
const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

export const segments = (pointer: string): JSONPath =>
  pointer
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));

/** `text` with the value at `pointer` set; `undefined` removes it. */
export const setAt = (text: string, pointer: string, value: unknown): string => applyEdits(text, modify(text, segments(pointer), value, FORMAT));

/** The value at a pointer in a parsed document. */
export function valueAt(doc: unknown, pointer: string): unknown {
  let at = doc;
  for (const seg of segments(pointer)) at = at && typeof at === 'object' ? (at as Record<string | number, unknown>)[seg] : undefined;
  return at;
}

/** Apply a type's edit; returns the new text and the pointer of what it made. */
export function apply(text: string, doc: unknown, e: SourceEdit): { text: string; at: string } {
  if (!e.append) return { text: setAt(text, e.at, e.value), at: e.at };
  const list = valueAt(doc, e.at);
  const n = Array.isArray(list) ? list.length : 0;
  if (!Array.isArray(list)) return { text: setAt(text, e.at, [e.value]), at: `${e.at}/0` };
  return { text: applyEdits(text, modify(text, [...segments(e.at), n], e.value, { ...FORMAT, isArrayInsertion: true })), at: `${e.at}/${n}` };
}

/** Every id used anywhere in a document. */
function ids(doc: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(doc)) doc.forEach((d) => ids(d, out));
  else if (doc && typeof doc === 'object')
    for (const [k, v] of Object.entries(doc)) {
      if (k === 'id' && typeof v === 'string') out.add(v);
      else ids(v, out);
    }
  return out;
}

/** An id not yet used, from a label: "Start / end" → "start-end-2". */
export function freshId(doc: unknown, label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const used = ids(doc);
  for (let n = 1; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}
