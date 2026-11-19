/**
 * Markdown compared block by block (URS-WS-033): paragraphs, headings, list items, table rows, code
 * blocks and the like are lined up with the line diff over their fingerprints, then marked.
 */
import type { MdNode } from '../markdown/node.ts';
import { diff } from './myers.ts';

export type Mark = 'added' | 'removed' | 'changed';

export interface BlockDiff {
  /** Marks on the old document's blocks (removed, changed) and the new one's (added, changed). */
  a: Map<MdNode, Mark>;
  b: Map<MdNode, Mark>;
  added: number;
  removed: number;
  changed: number;
}

const CONTAINERS = new Set(['document', 'block_quote', 'list', 'table', 'footnote_definition']);

/** An item is one block unless it holds more than paragraphs (a nested list, code): then its parts are. */
const simpleItem = (n: MdNode) => {
  for (let c = n.firstChild; c; c = c.next) if (c.type !== 'paragraph') return false;
  return true;
};

/** The blocks of a document, in reading order. */
export function blocks(doc: MdNode): MdNode[] {
  const out: MdNode[] = [];
  const visit = (n: MdNode) => {
    if (CONTAINERS.has(n.type) || (n.type === 'item' && !simpleItem(n))) {
      for (let c = n.firstChild; c; c = c.next) visit(c);
    } else out.push(n);
  };
  visit(doc);
  return out;
}

/** What a block says: its kind, settings and text, all the way down, so any visible change shows. */
export function fingerprint(n: MdNode): string {
  let s = `${n.type}:${n.level}:${n.info}:${n.checked ?? ''}:${n.header ? 'h' : ''}:${n.destination}:${n.literal}`;
  for (let c = n.firstChild; c; c = c.next) s += `(${fingerprint(c)})`;
  return s;
}

export function diffBlocks(oldDoc: MdNode, newDoc: MdNode): BlockDiff {
  const A = blocks(oldDoc);
  const B = blocks(newDoc);
  const result: BlockDiff = { a: new Map(), b: new Map(), added: 0, removed: 0, changed: 0 };
  const ops = diff(A, B, fingerprint);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    if (op.type === 'same') continue;
    const del = op.type === 'del' ? A.slice(op.a, op.a + op.n) : [];
    const insOp = op.type === 'ins' ? op : ops[i + 1]?.type === 'ins' ? ops[++i]! : undefined;
    const ins = insOp ? B.slice(insOp.b, insOp.b + insOp.n) : [];
    // In the same place, blocks of the same kind are the same block changed.
    let j = 0;
    for (; j < Math.min(del.length, ins.length) && del[j]!.type === ins[j]!.type; j++) {
      result.a.set(del[j]!, 'changed');
      result.b.set(ins[j]!, 'changed');
      result.changed++;
    }
    for (const n of del.slice(j)) result.a.set(n, 'removed');
    for (const n of ins.slice(j)) result.b.set(n, 'added');
    result.removed += del.length - j;
    result.added += ins.length - j;
  }
  return result;
}
