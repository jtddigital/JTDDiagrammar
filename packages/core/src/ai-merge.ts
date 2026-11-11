/** Helpers for DiagramType.ai.merge (URS-AI-013). */

/** Copy only the listed keys that are present. */
export const pick = <T extends object, K extends keyof T>(o: T, ...keys: K[]): Pick<T, K> =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as Pick<T, K>;

export const byId = <T extends { id: string }>(xs: readonly T[]): Map<string, T> => new Map(xs.map((x) => [x.id, x]));

/** Matches edges to their previous version by endpoints, preferring the same label (`labelOf`); each previous edge is used once. */
export function edgeMatcher<T extends { from: string; to: string }>(prev: readonly T[], labelOf: (e: T) => string | undefined) {
  const pool = [...prev];
  return (e: T): T | undefined => {
    const exact = pool.findIndex((p) => p.from === e.from && p.to === e.to && labelOf(p) === labelOf(e));
    const i = exact >= 0 ? exact : pool.findIndex((p) => p.from === e.from && p.to === e.to);
    return i >= 0 ? pool.splice(i, 1)[0] : undefined;
  };
}
