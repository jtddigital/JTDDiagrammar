/**
 * Two versions of a diagram compared through their Graph IR (URS-WS-035, D-008): nodes, containers, lanes,
 * phases and their groups match by id; edges by their ends (the n-th edge from A to B), since generated edge
 * ids count positions. Every type compares the same way: there is no type-specific code.
 */
import type { GraphIR } from '../ir/types.ts';

/** Kinds of drawn element, by their SVG id prefix (URS-RN-005); `d` is the diagram as a whole (title, legend…). */
export type ElementKind = 'd' | 'n' | 'e' | 'c' | 'l' | 'p' | 'lg' | 'pg';
export type ChangeType = 'added' | 'removed' | 'changed';

export interface FieldChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

export interface IrChange {
  kind: ElementKind;
  type: ChangeType;
  /** Model id on each side it exists on (edges can differ). */
  a?: string;
  b?: string;
  /** Source pointers on each side. */
  srcA?: string;
  srcB?: string;
  fields: FieldChange[];
  /** In plain words, e.g. `Node “Approve”: label “Check” → “Approve”`. */
  text: string;
}

export interface IrDiff {
  changes: IrChange[];
  /** Marks per drawn element id (`n-approve`), for each side. */
  marksA: Record<string, ChangeType>;
  marksB: Record<string, ChangeType>;
}

interface Item {
  id: string;
  src?: string;
  label?: string;
  from?: string;
  to?: string;
  [k: string]: unknown;
}

/** Bookkeeping, not content: where it came from, and draw order. */
const SKIP = new Set(['id', 'src', 'quote', 'order']);
const NAMES: Record<ElementKind, string> = { d: 'Diagram', n: 'Node', e: 'Link', c: 'Group', l: 'Lane', p: 'Phase', lg: 'Lane group', pg: 'Phase group' };
/** What the whole diagram draws, apart from its elements. */
const WHOLE = ['title', 'direction', 'theme', 'meta', 'legend', 'timeline', 'compact'] as const;
const FIELD_NAMES: Record<string, string> = { meta: 'title block', sub: 'detail', parent: 'group', span: 'dates', labels: 'labels', members: 'members' };

const elements = (ir: GraphIR): [ElementKind, Item[]][] => {
  const p = ir.partitions;
  return [
    ['n', ir.nodes],
    ['c', ir.containers],
    ['l', p?.lanes ?? []],
    ['p', p?.phases ?? []],
    ['lg', p?.laneGroups ?? []],
    ['pg', p?.phaseGroups ?? []],
    ['e', ir.edges],
  ] as unknown as [ElementKind, Item[]][];
};

/** Key an element is matched by: its id, or for an edge its ends and how many such edges came before. */
function keyed(kind: ElementKind, items: Item[]): Map<string, Item> {
  const seen = new Map<string, number>();
  return new Map(
    items.map((x) => {
      if (kind !== 'e') return [x.id, x];
      const ends = JSON.stringify([x.from, x.to]);
      const n = seen.get(ends) ?? 0;
      seen.set(ends, n + 1);
      return [`${ends}#${n}`, x];
    }),
  );
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

function fieldChanges(a: Item, b: Item): FieldChange[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !SKIP.has(k));
  return keys.filter((k) => !same(a[k], b[k])).map((k) => ({ field: k, ...(a[k] !== undefined && { before: a[k] }), ...(b[k] !== undefined && { after: b[k] }) }));
}

const quoted = (s: string) => `“${s}”`;

/** A value in words: text as it is, a lane or phase by its label, anything else briefly. */
function shown(v: unknown, bands: Map<string, string>): string {
  if (typeof v === 'string') return quoted(bands.get(v) ?? v);
  if (Array.isArray(v) && v.every((x) => typeof (x as { text?: unknown })?.text === 'string')) return v.map((x) => quoted((x as { text: string }).text)).join(', ');
  const s = JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

export function diffIR(a: GraphIR, b: GraphIR): IrDiff {
  const label = (ir: GraphIR) => new Map(ir.nodes.map((n) => [n.id, n.label || n.id]));
  const labelsA = label(a);
  const labelsB = label(b);
  const bands = new Map([...[a, b].flatMap((ir) => [...(ir.partitions?.lanes ?? []), ...(ir.partitions?.phases ?? [])].map((x) => [x.id, x.label] as const))]);
  const name = (kind: ElementKind, x: Item, labels: Map<string, string>) =>
    kind === 'e' ? `${quoted(labels.get(x.from!) ?? x.from!)} → ${quoted(labels.get(x.to!) ?? x.to!)}` : quoted(typeof x.label === 'string' && x.label ? x.label : x.id);

  const out: IrDiff = { changes: [], marksA: {}, marksB: {} };
  const whole = (ir: GraphIR) => Object.fromEntries(WHOLE.map((k) => [k, ir[k]])) as Item;
  const words = (fields: FieldChange[]) =>
    fields.map((f) => `${FIELD_NAMES[f.field] ?? f.field} ${f.before === undefined ? `set to ${shown(f.after, bands)}` : f.after === undefined ? `${shown(f.before, bands)} cleared` : `${shown(f.before, bands)} → ${shown(f.after, bands)}`}`).join('; ');
  const top = fieldChanges(whole(a), whole(b));
  if (top.length) out.changes.push({ kind: 'd', type: 'changed', fields: top, text: `Diagram: ${words(top)}` });
  const kindsB = new Map(elements(b));
  for (const [kind, itemsA] of elements(a)) {
    const A = keyed(kind, itemsA);
    const B = keyed(kind, kindsB.get(kind) ?? []);
    for (const [k, x] of A) {
      const y = B.get(k);
      if (!y) {
        out.changes.push({ kind, type: 'removed', a: x.id, ...(x.src && { srcA: x.src }), fields: [], text: `${NAMES[kind]} ${name(kind, x, labelsA)} removed` });
        out.marksA[`${kind}-${x.id}`] = 'removed';
        continue;
      }
      const fields = fieldChanges(x, y);
      if (!fields.length) continue;
      out.changes.push({ kind, type: 'changed', a: x.id, b: y.id, ...(x.src && { srcA: x.src }), ...(y.src && { srcB: y.src }), fields, text: `${NAMES[kind]} ${name(kind, y, labelsB)}: ${words(fields)}` });
      out.marksA[`${kind}-${x.id}`] = 'changed';
      out.marksB[`${kind}-${y.id}`] = 'changed';
    }
    for (const [k, y] of B) {
      if (A.has(k)) continue;
      out.changes.push({ kind, type: 'added', b: y.id, ...(y.src && { srcB: y.src }), fields: [], text: `${NAMES[kind]} ${name(kind, y, labelsB)} added` });
      out.marksB[`${kind}-${y.id}`] = 'added';
    }
  }
  return out;
}
