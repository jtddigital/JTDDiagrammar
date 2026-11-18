import { pointer } from '../../diagnostics.ts';
import type { Band, IREdge, IRNode, Style } from '../../ir/types.ts';
import { noted, noteOf } from '../annotations.ts';
import { merged, over } from '../section-styles.ts';
import type { Sap, SapStep, SapWorkflow } from './model.ts';
import { DASHED } from '../process/draw.ts';

export { DASHED };
export const workflowLane = (w: SapWorkflow) => `wf:${w.id}`;

interface Ctx {
  m: Sap;
  /** Column of a status code, or the first column. */
  col: (code: string | undefined) => string;
  /** The pill of a known status code. */
  pill: (code: string) => string | undefined;
}

/** "If: …" for a step's or workflow's conditions. */
const ifs = (c: string[] | undefined) => (c?.length ? `If: ${c.join('; ')}` : undefined);

/**
 * A flexible workflow's row (URS-TYP-021): a dashed arrow from the status whose event starts it, its start
 * conditions as a gate, the approval steps in order (Release leads on, Reject cancels, Rework goes back
 * to the requester and returns as configured), the statuses set on release or rejection, and the end.
 * When every step can be skipped, a dashed arrow marks the automatic release.
 */
export function workflowParts(c: Ctx, w: SapWorkflow, wi: number): { lane: Band; nodes: IRNode[]; edges: IREdge[] } {
  const { m } = c;
  const lane = workflowLane(w);
  const p = (s: string) => `${lane}:${s}`;
  const src = (...k: (string | number)[]) => pointer('workflows', wi, ...k);
  const home = w.trigger?.status ?? w.steps.find((s) => s.status)?.status;
  const at = (code: string | undefined) => ({ lane, phase: c.col(code ?? home) });
  const line = (extra?: Style) => over(m.edgeStyle, extra);
  const nodes: IRNode[] = [{ id: p('start'), shape: 'start', label: 'Start', ...at(home), src: src('trigger') }];
  const edges: IREdge[] = [];
  const link = (from: string, to: string, text?: string, extra?: Style, at = src()) =>
    edges.push({ id: `${from}>${to}${text ? `:${text}` : ''}`, from, to, ...(text && { labels: [{ text }] }), ...line(extra), src: at });

  const trigger = w.trigger && c.pill(w.trigger.status);
  if (trigger) link(trigger, p('start'), w.trigger!.event ?? `${w.trigger!.status} set`, DASHED, src('trigger'));

  let entry = p('start');
  if (w.conditions?.length) {
    const note = noted(m, m.annotate ? noteOf(ifs(w.conditions), w.annotation) : w.annotation, { id: w.id, label: `${w.label} (start conditions)`, type: 'Start conditions', ...(w.tags && { tags: w.tags }) });
    nodes.push({ id: p('if'), shape: 'checkpoint', label: m.annotate ? '' : 'Start conditions', ...(!m.annotate && { sub: w.conditions.join('\n') }), ...note, ...at(home), src: src('conditions') });
    link(entry, p('if'));
    entry = p('if');
  } else Object.assign(nodes[0]!, noted(m, w.annotation, { id: w.id, label: w.label, type: 'Workflow', ...(w.tags && { tags: w.tags }) }));

  // What release and rejection lead to: the status set, then the end.
  nodes.push({ id: p('end'), shape: 'end', label: 'End', ...at(w.released ?? w.steps.at(-1)!.status), src: src() });
  const outcome = (key: 'released' | 'rejected') => {
    const code = w[key];
    if (code === undefined || !c.pill(code)) return p('end');
    nodes.push({ id: p(key), shape: 'chevron', label: code, ...at(code), src: src(key) });
    link(p(key), p('end'));
    return p(key);
  };
  const [released, rejected] = [outcome('released'), outcome('rejected')];

  const id = (s: SapStep) => p(`step:${s.id}`);
  const after = (i: number) => (i + 1 < w.steps.length ? id(w.steps[i + 1]!) : released);
  w.steps.forEach((s, i) => {
    const label = s.label ?? 'Approve';
    const note = noted(m, m.annotate ? noteOf(ifs(s.conditions), s.annotation) : s.annotation, {
      id: s.id,
      label: s.recipients ? `${label} (${s.recipients})` : label,
      type: 'Approval step',
      ...(s.recipients && { owner: s.recipients }),
      ...(s.tags && { tags: s.tags }),
    });
    const sub = [s.recipients, s.tcodes?.join(', '), m.annotate ? undefined : ifs(s.conditions)].filter(Boolean).join('\n');
    nodes.push({
      id: id(s),
      shape: 'process',
      label,
      ...(sub && { sub }),
      ...(s.deadline && { badges: [{ icon: 'clock' as const, text: s.deadline }] }),
      ...note,
      ...at(s.status),
      ...over(merged(m.styles?.steps, s.optional ? DASHED : undefined), s.style),
      ...(s.quote && { quote: s.quote }),
      src: src('steps', i),
    });
    link(i ? id(w.steps[i - 1]!) : entry, id(s), i ? 'Release' : undefined);
    link(id(s), rejected, 'Reject', undefined, src('steps', i));
    if (s.rework) {
      const back = p(`rework:${s.id}`);
      nodes.push({ id: back, shape: 'process', label: 'Rework', sub: 'Requester', ...at(s.status), src: src('steps', i, 'rework') });
      link(id(s), back, 'Rework', DASHED, src('steps', i, 'rework'));
      const to = s.rework === 'repeat' ? id(s) : s.rework === 'restart' ? id(w.steps[0]!) : after(i);
      link(back, to, `Resubmit (${s.rework})`, DASHED, src('steps', i, 'rework'));
    }
  });
  link(id(w.steps.at(-1)!), released, 'Release');
  // Every step may be skipped: then the document is released automatically.
  if (w.steps.every((s) => s.optional || s.conditions?.length)) link(entry, released, 'No step applies', DASHED);
  return { lane: { id: lane, label: w.label, src: src() }, nodes, edges };
}
