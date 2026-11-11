import { error, pointer, type Diagnostic } from '../../diagnostics.ts';
import type { Flowchart } from './model.ts';

/** Flowchart-only rules (URS-EXT-007). Cross-reference checks are common (validate/common.ts). */
export function validateFlowchart(m: Flowchart): Diagnostic[] {
  if (m.lanes) return [];
  const out: Diagnostic[] = [];
  if (m.phases) out.push(error('flowchart.phases', "'phases' requires 'lanes'", '/phases'));
  m.nodes.forEach((n, i) => {
    for (const key of ['lane', 'phase'] as const)
      if (n[key] !== undefined) out.push(error('flowchart.partition', `node '${n.id}' sets '${key}' but the diagram has no lanes`, pointer('nodes', i, key)));
  });
  return out;
}
