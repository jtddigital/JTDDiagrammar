import { pointer } from '../../diagnostics.ts';
import type { Band, IREdge, IRNode, Style } from '../../ir/types.ts';
import { noted, noteOf } from '../annotations.ts';
import { over } from '../section-styles.ts';
import type { Sap, SapReleaseCode, SapReleaseStrategy } from './model.ts';
import { DASHED } from './workflows.ts';

export const strategyLane = (r: SapReleaseStrategy) => `rs:${r.id}`;
export const docNode = (id: string) => `doc:${id}`;

interface Ctx {
  m: Sap;
  col: (code: string | undefined) => string;
  /** Column of a document. */
  docCol: (id: string) => string | undefined;
}

/**
 * A classic release strategy's row (URS-TYP-022): a dashed arrow from the document it releases, its release
 * conditions (classification) as a gate, then each release code once its prerequisites have released it
 * (codes without any start straight away), and the end once every last code has. When the conditions do not
 * hold, a dashed arrow marks the document released at once.
 */
export function strategyParts(c: Ctx, r: SapReleaseStrategy, ri: number): { lane: Band; nodes: IRNode[]; edges: IREdge[] } {
  const { m } = c;
  const lane = strategyLane(r);
  const p = (s: string) => `${lane}:${s}`;
  const src = (...k: (string | number)[]) => pointer('releaseStrategies', ri, ...k);
  const phase = r.status !== undefined ? c.col(r.status) : ((r.document !== undefined && c.docCol(r.document)) || c.col(undefined));
  const at = { lane, phase };
  const line = (extra?: Style) => over(m.edgeStyle, extra);
  const nodes: IRNode[] = [{ id: p('start'), shape: 'start', label: 'Start', ...at, src: src() }];
  const edges: IREdge[] = [];
  const link = (from: string, to: string, text?: string, extra?: Style, s = src()) =>
    edges.push({ id: `${from}>${to}${text ? `:${text}` : ''}`, from, to, ...(text && { labels: [{ text }] }), ...line(extra), src: s });
  if (r.document !== undefined && c.docCol(r.document) !== undefined) link(docNode(r.document), p('start'), 'Release strategy', DASHED, src('document'));

  let entry = p('start');
  if (r.conditions?.length) {
    const about = { id: r.id, label: `${r.label} (release conditions)`, type: 'Release conditions', ...(r.tags && { tags: r.tags }) };
    const note = noted(m, m.annotate ? noteOf(`If: ${r.conditions.join('; ')}`, r.annotation) : r.annotation, about);
    nodes.push({ id: p('if'), shape: 'checkpoint', label: m.annotate ? '' : 'Release conditions', ...(!m.annotate && { sub: r.conditions.join('\n') }), ...note, ...at, src: src('conditions') });
    link(entry, p('if'));
    entry = p('if');
  } else Object.assign(nodes[0]!, noted(m, r.annotation, { id: r.id, label: r.label, type: 'Release strategy', ...(r.tags && { tags: r.tags }) }));

  nodes.push({ id: p('end'), shape: 'end', label: 'Released', ...at, src: src() });
  const codes = new Set(r.codes.map((x) => x.code));
  const id = (x: SapReleaseCode) => p(`code:${x.code}`);
  r.codes.forEach((x, i) => {
    const sub = [`Release code ${x.code}`, x.indicator && `Indicator: ${x.indicator}`].filter(Boolean).join('\n');
    const about = { id: x.code, label: x.label ?? x.code, type: 'Release code', ...(x.tags && { tags: x.tags }) };
    nodes.push({ id: id(x), shape: 'process', label: x.label ?? x.code, sub, ...noted(m, x.annotation, about), ...at, ...over(m.styles?.steps, x.style), ...(x.quote && { quote: x.quote }), src: src('codes', i) });
    const before = (x.prerequisites ?? []).filter((q) => codes.has(q) && q !== x.code);
    if (!before.length) link(entry, id(x), undefined, undefined, src('codes', i));
    for (const q of before) link(p(`code:${q}`), id(x), 'Release', undefined, src('codes', i, 'prerequisites'));
  });
  // The last codes: those no other code waits for.
  const needed = new Set(r.codes.flatMap((x) => x.prerequisites ?? []));
  for (const x of r.codes) if (!needed.has(x.code)) link(id(x), p('end'), 'Release');
  // Rejection (URS-TYP-025): the requester changes the document and resubmits, and the strategy starts again.
  const rejecting = r.codes.filter((x) => x.reject);
  if (rejecting.length) {
    const back = p('rejected');
    nodes.push({ id: back, shape: 'process', label: 'Rejected', sub: 'Requester changes and resubmits', ...at, src: src('codes', r.codes.indexOf(rejecting[0]!), 'reject') });
    for (const x of rejecting) link(id(x), back, 'Reject', undefined, src('codes', r.codes.indexOf(x), 'reject'));
    link(back, p('start'), 'Resubmit', DASHED, src('codes', r.codes.indexOf(rejecting[0]!), 'reject'));
  }
  if (r.conditions?.length) link(entry, p('end'), 'Conditions not met', DASHED);
  return { lane: { id: lane, label: r.label, src: src() }, nodes, edges };
}
