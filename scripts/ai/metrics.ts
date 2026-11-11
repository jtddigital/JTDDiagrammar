import { compile, type Registry } from '@jtd/core';

/** What a good diagram for a corpus document must contain, by label (URS-AI-018). */
export interface Expected {
  nodes: string[];
  edges?: [string, string][];
  /** Node label → lane label, for cross-functional flowcharts. */
  lanes?: Record<string, string>;
}

export interface Score {
  nodeRecall: number;
  edgeRecall: number;
  laneAccuracy?: number;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'its', 'their', 'then', 'that', 'this', 'against']);
/** Crude stemmer: enough to match "submits"/"submit" and "approved"/"approve". */
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP.has(w))
      .map(stem),
  );

/** Fuzzy label match: one contains the other, or their significant words overlap by half (Jaccard ≥ 0.5). */
export function similar(a: string, b: string): boolean {
  const [x, y] = [a.toLowerCase().trim(), b.toLowerCase().trim()];
  if (x && y && (x.includes(y) || y.includes(x))) return true;
  const [wa, wb] = [words(a), words(b)];
  const both = [...wa].filter((w) => wb.has(w)).length;
  return both > 0 && both / new Set([...wa, ...wb]).size >= 0.5;
}

/** Score a generated source against expectations, via the IR so every diagram type is scored the same way. */
export function score(source: unknown, expected: Expected, reg: Registry): Score {
  const ir = compile(source, reg).ir;
  if (!ir) return { nodeRecall: 0, edgeRecall: 0, ...(expected.lanes && { laneAccuracy: 0 }) };
  const labelled = [...ir.nodes, ...ir.containers].map((n) => ({ id: n.id, label: n.label ?? n.id, lane: (n as { lane?: string }).lane }));
  const find = (label: string) => labelled.find((n) => similar(n.label, label));
  const ratio = (hits: number, total: number) => (total ? hits / total : 1);

  const nodeRecall = ratio(expected.nodes.filter((l) => find(l)).length, expected.nodes.length);
  const edges = expected.edges ?? [];
  const edgeRecall = ratio(
    edges.filter(([f, t]) => {
      const [a, b] = [find(f), find(t)];
      return a && b && ir.edges.some((e) => e.from === a.id && e.to === b.id);
    }).length,
    edges.length,
  );
  if (!expected.lanes) return { nodeRecall, edgeRecall };
  const laneLabel = new Map((ir.partitions?.lanes ?? []).map((l) => [l.id, l.label]));
  const entries = Object.entries(expected.lanes);
  const laneAccuracy = ratio(entries.filter(([node, lane]) => similar(laneLabel.get(find(node)?.lane ?? '') ?? '', lane)).length, entries.length);
  return { nodeRecall, edgeRecall, laneAccuracy };
}
