/** Annotation text from its parts, one per line; undefined when there are none (URS-DM-029). */
export const noteOf = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('\n') || undefined;
