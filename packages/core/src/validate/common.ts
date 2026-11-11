import { error, type Diagnostic } from '../diagnostics.ts';
import type { Band, GraphIR } from '../ir/types.ts';

const duplicates = (items: readonly { id: string; src?: string }[], what: string): Diagnostic[] => {
  const seen = new Set<string>();
  return items.flatMap((i) => (seen.has(i.id) ? [error('id.duplicate', `duplicate ${what} id '${i.id}'`, i.src)] : (seen.add(i.id), [])));
};

const ids = (bands: readonly Band[] | undefined) => new Set(bands?.map((b) => b.id));

/** Type-agnostic semantic rules over the IR (URS-IN-005, URS-DM-005). */
export function validateIR(ir: GraphIR): Diagnostic[] {
  const elements = [...ir.nodes, ...ir.containers];
  const elementIds = new Set(elements.map((e) => e.id));
  const containerIds = new Set(ir.containers.map((c) => c.id));
  const parentOf = new Map(ir.containers.map((c) => [c.id, c.parent]));
  const out = [...duplicates(elements, 'node'), ...duplicates(ir.edges, 'edge')];

  for (const e of elements)
    if (e.parent !== undefined && !containerIds.has(e.parent)) out.push(error('ref.parent', `'${e.id}' references unknown parent '${e.parent}'`, e.src));

  for (const c of ir.containers) {
    const seen = new Set([c.id]);
    for (let p = c.parent; p !== undefined; p = parentOf.get(p)) {
      if (seen.has(p)) {
        out.push(error('ref.cycle', `container '${c.id}' is its own ancestor`, c.src));
        break;
      }
      seen.add(p);
    }
  }

  for (const e of ir.edges)
    for (const end of [e.from, e.to])
      if (!elementIds.has(end)) out.push(error('ref.edge', `edge '${e.id}' references unknown node '${end}'`, e.src));

  const p = ir.partitions;
  if (p) {
    out.push(...duplicates(p.lanes, 'lane'), ...duplicates(p.phases ?? [], 'phase'));
    const lanes = ids(p.lanes);
    const phases = ids(p.phases);
    for (const n of ir.nodes) {
      if (n.lane === undefined) out.push(error('ref.lane', `node '${n.id}' must be assigned to a lane`, n.src));
      else if (!lanes.has(n.lane)) out.push(error('ref.lane', `node '${n.id}' references unknown lane '${n.lane}'`, n.src));
      if (p.phases && n.phase === undefined) out.push(error('ref.phase', `node '${n.id}' must be assigned to a phase`, n.src));
      else if (n.phase !== undefined && !phases.has(n.phase)) out.push(error('ref.phase', `node '${n.id}' references unknown phase '${n.phase}'`, n.src));
    }
  }
  return out;
}
