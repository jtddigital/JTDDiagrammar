/** Annotation text from its parts, one per line; undefined when there are none (URS-DM-029). */
export const noteOf = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('\n') || undefined;

/** Whether the notes name what each annotation is attached to, and how. */
export const ANNOTATION_TARGETS = ['none', 'id', 'label'] as const;
export type AnnotationTarget = (typeof ANNOTATION_TARGETS)[number];

export const annotationTargetSchema = {
  type: 'string',
  enum: ANNOTATION_TARGETS,
  default: 'none',
  description: 'Name what each annotation is attached to, in bold above its note: by `id` or by `label`; `none` (default) leaves it out.',
} as const;

/** An IR node's annotation, and what it is attached to when the chart names it (URS-DM-029). */
export const noted = (target: AnnotationTarget | undefined, note: string | undefined, id: string, label: string) =>
  note ? { note, ...(target === 'id' ? { noteOn: id } : target === 'label' ? { noteOn: label || id } : {}) } : {};
