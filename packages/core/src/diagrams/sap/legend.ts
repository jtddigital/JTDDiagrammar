import type { IREdge, IRNode, LegendItem } from '../../ir/types.ts';
import { MARK_SHAPE, MARK_STYLE, MARK_TEXT } from './matrix.ts';
import type { Sap } from './model.ts';
import { DASHED } from './workflows.ts';

/** The legend of an SAP chart (URS-DM-026): only what it uses. */
export function sapLegend(m: Sap, nodes: readonly IRNode[], edges: readonly IREdge[]): LegendItem[] {
  const out: LegendItem[] = [];
  const has = (p: (n: IRNode) => boolean) => nodes.some(p);
  const add = (on: boolean, it: LegendItem) => on && !out.some((o) => o.label === it.label) && out.push(it);
  add(has((n) => n.id === 'sys:start' || n.id === 'us:start'), { label: 'Initial status', shape: 'initial' });
  add(has((n) => n.id.startsWith('us:') && n.shape === 'state' && n.style?.dash === 'dashed'), { label: 'Flag (any time)', shape: 'state', style: { dash: 'dashed' } });
  add(edges.some((e) => e.id.startsWith('next:')), { label: 'Next status (in range)', line: {} });
  add(has((n) => n.shape === 'start'), { label: 'Workflow start', shape: 'start' });
  add(has((n) => n.shape === 'checkpoint'), { label: 'Start conditions', shape: 'checkpoint' });
  add(has((n) => n.shape === 'process' && n.label !== 'Rework'), { label: 'Approval step', shape: 'process', ...(m.styles?.steps && { style: m.styles.steps }) });
  add(has((n) => n.shape === 'process' && n.style?.dash === 'dashed'), { label: 'Optional step', shape: 'process', style: DASHED });
  add(has((n) => n.badges?.some((b) => b.icon === 'clock') ?? false), { label: 'Deadline', icon: 'clock' });
  add(has((n) => n.shape === 'chevron'), { label: 'Sets a status', shape: 'chevron' });
  add(has((n) => n.shape === 'end'), { label: 'Workflow end', shape: 'end' });
  add(edges.some((e) => e.style?.dash === 'dashed'), { label: 'Starts a workflow, rework', line: DASHED });
  for (const k of ['allowed', 'warning', 'forbidden', 'set', 'delete'] as const) add(has((n) => n.shape === MARK_SHAPE[k]), { label: MARK_TEXT[k], shape: MARK_SHAPE[k], style: MARK_STYLE[k] });
  return out;
}
