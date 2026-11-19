/**
 * Heading anchors as GitHub makes them (URS-WS-041): lower case, punctuation dropped, spaces to hyphens, and a
 * repeat of the same slug numbered `-1`, `-2`… One slugger per document.
 */
export function slugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-');
    let slug = base;
    while (seen.has(slug)) {
      const n = seen.get(base)! + 1;
      seen.set(base, n);
      slug = `${base}-${n}`;
    }
    seen.set(slug, 0);
    return slug;
  };
}
