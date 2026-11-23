import { compile, parseJson, render, type EditAssets, type EditEnd, type GraphIR } from '@jtd/core';
import { registry } from '../registry.ts';
import { fields, schemaAt, type Schema } from './schema.ts';
import { apply, freshId, ids, setAt, valueAt } from './source.ts';

/**
 * Shapes added but not yet in the source (URS-WEB-031). A draft is put anywhere on the drawing and moved freely;
 * the source, and so the layout, only take it when it is applied or connected. Pure, so it is unit-tested.
 */
export interface Draft {
  key: string;
  /** The type's addition it makes (`EditAssets.add[].label`). */
  label: string;
  /** The id it will have, kept free of the document's and other drafts'. */
  id: string;
  /** Where it was put, in drawing coordinates: its centre. */
  x: number;
  y: number;
  /** Source pointers of the lanes, phases or columns it sits in, e.g. `/lanes/1`. */
  bands: string[];
}

export interface Doc {
  text: string;
  value: unknown;
}

type Assets = EditAssets<never>;

const addition = (edit: Assets, doc: Doc, label: string) => edit.add.find((a) => a.label === label && (!a.available || a.available(doc.value as never)));

/** A new draft, with an id used neither in the document nor by the other drafts. */
export function draft(doc: Doc, drafts: readonly Draft[], label: string, at: { x: number; y: number }, bands: string[] = []): Draft {
  const id = freshId([doc.value, drafts.map((d) => ({ id: d.id }))], label);
  return { key: id, label, id, x: at.x, y: at.y, bands };
}

/**
 * A new element put in the bands it was dropped in (URS-WEB-031): each of its placement references (schema
 * category `placement`) that may point into a band's collection takes that band's id, e.g. a node dropped in
 * the Finance lane gets `lane: "fin"`, a workflow step dropped in a status column takes that status.
 */
export function settle(text: string, value: unknown, at: string, bands: readonly string[]): string {
  const root = registry.type(String((value as { type?: unknown }).type))?.schema as Schema | undefined;
  const s = root && schemaAt(root, at);
  if (!root || !s) return text;
  const refs = fields(root, s).filter((f) => f.kind === 'ref' && f.section === 'placement');
  for (const b of bands) {
    const collection = /\/([^/]+)\/\d+$/.exec(b)?.[1];
    const band = valueAt(value, b) as Record<string, unknown> | undefined;
    for (const f of refs) {
      const [names = '', key = 'id'] = f.ref!.split('#');
      const v = band?.[key];
      if (collection && names.split(',').includes(collection) && typeof v === 'string') text = setAt(text, `${at}/${f.name}`, v);
    }
  }
  return text;
}

/** The drawn node made from a source pointer: the one made there, or else the first made inside it. */
const nodeAt = (ir: GraphIR | undefined, at: string) => ir?.nodes.find((n) => n.src === at) ?? ir?.nodes.find((n) => n.src?.startsWith(`${at}/`));

/**
 * Write a draft into the source: the document after it, where it went, and its end for `connect` (its drawn id
 * and pointer). Undefined when the type can no longer add it.
 */
export function place(edit: Assets, doc: Doc, d: Draft): { doc: Doc; at: string; end: EditEnd } | undefined {
  const a = addition(edit, doc, d.label);
  if (!a || doc.value === undefined) return undefined;
  const id = ids(doc.value).has(d.id) ? freshId(doc.value, d.label) : d.id;
  const out = apply(doc.text, doc.value, a.make(id, doc.value as never));
  const text = settle(out.text, doc.value, out.at, d.bands);
  const value = parseJson(text).value;
  const node = value === undefined ? undefined : nodeAt(compile(value, registry).ir, out.at);
  return { doc: { text, value }, at: out.at, end: { id: node?.id ?? id, src: out.at } };
}

/** What a draft will look like: the diagram drawn with it, its node's drawn id and size. */
export function look(edit: Assets, doc: Doc, d: Draft): { svg: string; id: string; w: number; h: number } | undefined {
  const a = addition(edit, doc, d.label);
  if (!a || doc.value === undefined) return undefined;
  const out = apply(doc.text, doc.value, a.make(d.id, doc.value as never));
  const value = parseJson(out.text).value;
  if (value === undefined) return undefined;
  const r = render(value, registry, { bestEffort: true });
  const node = nodeAt(r.ir, out.at);
  const box = node && r.geometry?.nodes.find((n) => n.id === node.id);
  return r.svg && box ? { svg: r.svg, id: box.id, w: box.w, h: box.h } : undefined;
}

/** An end of a connection: an element already drawn (`n`), or a draft (`draft`) written into the source first. */
export interface End {
  kind: string;
  id: string;
}

/**
 * Connect two ends, writing any draft among them into the source first (URS-WEB-030, WEB-031). Returns the new
 * source, the pointer of the connection, the drafts it used and where the last one went; or why it could not.
 */
export function join(edit: Assets, doc: Doc, drafts: readonly Draft[], pointerOf: (e: End) => string | undefined, a: End, b: End): { text: string; at: string; used: string[]; placed?: string } | { refused: string } {
  if (!edit.connect) return { refused: 'This diagram type has no connections to draw' };
  if (a.kind === b.kind && a.id === b.id) return { refused: 'Drop it on another shape to connect them' };
  let cur = doc;
  const ends: EditEnd[] = [];
  const used: string[] = [];
  let placed: string | undefined;
  for (const e of [a, b]) {
    if (e.kind === 'draft') {
      const d = drafts.find((x) => x.key === e.id);
      const p = d && place(edit, cur, d);
      if (!p) return { refused: `${d?.label ?? 'That shape'} can no longer be added` };
      cur = p.doc;
      ends.push(p.end);
      used.push(e.id);
      placed = p.at;
    } else {
      const src = pointerOf(e);
      ends.push({ id: e.id, ...(src !== undefined && { src }) });
    }
  }
  const c = edit.connect(cur.value as never, ends[0]!, ends[1]!);
  if (!c) return { refused: 'Those two cannot be connected' };
  const out = apply(cur.text, cur.value, c);
  return { text: out.text, at: out.at, used, ...(placed !== undefined && { placed }) };
}
