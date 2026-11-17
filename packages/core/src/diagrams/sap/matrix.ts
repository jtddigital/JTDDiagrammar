import { pointer } from '../../diagnostics.ts';
import type { Band, BandGroup, IRNode, Style } from '../../ir/types.ts';
import type { Rule, Sap } from './model.ts';

export const CONTROL_GROUP = 'sap:control';
/** Mark colours: green allowed, amber warning, red forbidden, blue for setting or deleting the status (URS-TYP-020). */
export const MARK_STYLE: Record<Rule | 'set' | 'delete', Style> = {
  allowed: { stroke: '#2e7d32' },
  warning: { stroke: '#e65100' },
  forbidden: { stroke: '#c62828' },
  set: { stroke: '#1565c0' },
  delete: { stroke: '#1565c0' },
};
export const MARK_SHAPE: Record<Rule | 'set' | 'delete', string> = { allowed: 'allowed', warning: 'warning', forbidden: 'forbidden', set: 'setStatus', delete: 'deleteStatus' };
export const MARK_TEXT: Record<Rule | 'set' | 'delete', string> = {
  allowed: 'Allowed',
  warning: 'Allowed with a warning',
  forbidden: 'Forbidden',
  set: 'Sets the status',
  delete: 'Deletes the status',
};

/**
 * Transaction control as a matrix (URS-TYP-020): one row per business transaction, grouped; in each user
 * status's column, a mark for how the transaction stands while the status is active, and whether it sets or
 * deletes the status.
 */
export function matrixParts(m: Sap, col: (code: string) => string): { lanes: Band[]; group?: BandGroup; nodes: IRNode[] } {
  const txs = m.transactions ?? [];
  const lanes: Band[] = txs.map((t, i) => ({ id: `tx:${t.id}`, label: t.label ?? t.id, ...(t.label && { detail: t.id }), src: pointer('transactions', i) }));
  const nodes: IRNode[] = [];
  (m.userStatuses ?? []).forEach((u, ui) => {
    const marks = (kind: Rule | 'set' | 'delete', t: string, at: string) => {
      if (!txs.some((x) => x.id === t)) return;
      const name = txs.find((x) => x.id === t)!.label ?? t;
      nodes.push({ id: `mx:${t}:${u.code}:${kind}`, shape: MARK_SHAPE[kind], label: MARK_TEXT[kind], quote: `${name} in ${u.code}: ${MARK_TEXT[kind].toLowerCase()}`, lane: `tx:${t}`, phase: col(u.code), style: MARK_STYLE[kind], src: at });
    };
    for (const [t, rule] of Object.entries(u.control ?? {})) marks(rule, t, pointer('userStatuses', ui, 'control', t));
    u.setBy?.forEach((t, j) => marks('set', t, pointer('userStatuses', ui, 'setBy', j)));
    u.deletedBy?.forEach((t, j) => marks('delete', t, pointer('userStatuses', ui, 'deletedBy', j)));
  });
  return { lanes, ...(lanes.length && { group: { id: CONTROL_GROUP, label: 'Transaction control', members: lanes.map((l) => l.id), src: '/transactions/0' } }), nodes };
}
