import type { EdgeLabel } from '../ir/types.ts';

/** IR labels from the `label` shorthand (placed automatically) followed by `labels`, each optionally pinned by `at` (URS-DM-024). Empty text is dropped. */
export const edgeLabels = (label: string | undefined, labels: readonly EdgeLabel[] | undefined): { labels?: EdgeLabel[] } => {
  const all = [...(label ? [{ text: label }] : []), ...(labels ?? []).filter((l) => l.text)];
  return all.length ? { labels: all } : {};
};
