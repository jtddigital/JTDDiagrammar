import { pointer } from '../../diagnostics.ts';
import type { Band, IREdge, IRNode } from '../../ir/types.ts';
import { noted } from '../annotations.ts';
import { over } from '../section-styles.ts';
import type { Sap } from './model.ts';
import { docNode } from './release.ts';

export const DOCS_LANE = 'sap:documents';
/** A document hangs off the status it is created in by a dotted line, without an arrowhead. */
const CREATED = { dash: 'dotted' } as const;

/** Each document's column: the status it is created in, else its first known preceding document's, else the first. */
export function documentColumns(m: Sap, col: (code: string | undefined) => string): Map<string, string> {
  const docs = m.documents ?? [];
  const out = new Map<string, string>();
  const byId = new Map(docs.map((d) => [d.id, d]));
  const place = (id: string, seen: Set<string>): string => {
    if (out.has(id)) return out.get(id)!;
    const d = byId.get(id)!;
    const before = (d.from ?? []).find((f) => byId.has(f) && !seen.has(f));
    const at = d.status !== undefined ? col(d.status) : before ? place(before, new Set([...seen, id])) : col(undefined);
    out.set(id, at);
    return at;
  };
  for (const d of docs) place(d.id, new Set([d.id]));
  return out;
}

/**
 * The document flow row (URS-TYP-023): each document in the column of the status it is created in, joined to
 * that status by a dotted line, with an arrow from each preceding document.
 */
export function documentParts(m: Sap, docCol: Map<string, string>, pill: (code: string) => string | undefined): { lane: Band; nodes: IRNode[]; edges: IREdge[] } {
  const docs = m.documents ?? [];
  const ids = new Set(docs.map((d) => d.id));
  const nodes: IRNode[] = [];
  const edges: IREdge[] = [];
  docs.forEach((d, i) => {
    const src = pointer('documents', i);
    const about = { id: d.id, label: d.label, type: 'Document', ...(d.tags && { tags: d.tags }) };
    nodes.push({
      id: docNode(d.id),
      shape: 'document',
      label: d.label,
      ...(d.kind && { sub: d.kind }),
      ...noted(m, d.annotation, about),
      lane: DOCS_LANE,
      phase: docCol.get(d.id)!,
      ...(d.style && { style: d.style }),
      ...(d.quote && { quote: d.quote }),
      src,
    });
    const from = d.status !== undefined ? pill(d.status) : undefined;
    if (from) edges.push({ id: `${from}>${docNode(d.id)}`, from, to: docNode(d.id), marker: 'none', ...over(m.edgeStyle, CREATED), src: `${src}/status` });
    (d.from ?? []).forEach((f, j) => ids.has(f) && edges.push({ id: `${docNode(f)}>${docNode(d.id)}`, from: docNode(f), to: docNode(d.id), ...over(m.edgeStyle, undefined), src: pointer('documents', i, 'from', j) }));
  });
  return { lane: { id: DOCS_LANE, label: 'Document flow', src: pointer('documents', 0) }, nodes, edges };
}
