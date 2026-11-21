import { inGroup } from '../schema/fragments.ts';

/** Annotation text from its parts, one per line; undefined when there are none (URS-DM-029). */
export const noteOf = (...parts: (string | undefined)[]) => parts.filter(Boolean).join('\n') || undefined;

/** Whether the notes name what each annotation is attached to, and how. */
export const ANNOTATION_TARGETS = ['none', 'id', 'label'] as const;
export type AnnotationTarget = (typeof ANNOTATION_TARGETS)[number];
/** What the notes can be grouped by, level after level (URS-DM-030). */
export const ANNOTATION_GROUPS = ['type', 'owner', 'tag'] as const;
export type AnnotationGroup = (typeof ANNOTATION_GROUPS)[number];

/** A chart's annotation options. */
export interface AnnotationOptions {
  annotationTarget?: AnnotationTarget;
  annotationGroups?: AnnotationGroup[];
}

/** What an annotation is attached to: its name both ways, and what it can be grouped by. */
export interface About {
  id: string;
  label: string;
  /** Its kind of shape, e.g. "Task" or "Gate". */
  type: string;
  owner?: string;
  tags?: string[];
}

export const annotationSchema = {
  annotationTarget: {
    type: 'string',
    enum: ANNOTATION_TARGETS,
    default: 'none',
    description: 'Name what each annotation is attached to, in bold above its note: by `id` or by `label`; `none` (default) leaves it out.',
  },
  annotationGroups: {
    type: 'array',
    items: { type: 'string', enum: ANNOTATION_GROUPS },
    uniqueItems: true,
    maxItems: 3,
    description:
      'Group the notes under headings, level after level: by `type` (kind of shape, e.g. Task, Gate), `owner` or `tag`. E.g. `["type", "owner"]`: by type, then by owner within each. A note with several tags is listed under each.',
  },
} as const;

/** Tags of an item, for grouping its annotation (URS-DM-030). */
export const tagsSchema = inGroup('notes', { type: 'array', items: { type: 'string' }, description: 'Tags, e.g. for grouping annotations with `annotationGroups: ["tag"]`.' } as const);

/** The headings an annotation goes under, one list of values per grouping level; items without an owner or tag get "No owner" / "No tag". */
const groupsOf = (by: readonly AnnotationGroup[], a: About): string[][] =>
  by.map((k) => (k === 'type' ? [a.type] : k === 'owner' ? [a.owner || 'No owner'] : a.tags?.length ? a.tags : ['No tag']));

/** An IR node's annotation: the note, what it is attached to when the chart names it, and its groups (URS-DM-029, URS-DM-030). */
export const noted = (o: AnnotationOptions, note: string | undefined, a: About) =>
  note
    ? {
        note,
        ...(o.annotationTarget === 'id' ? { noteOn: a.id } : o.annotationTarget === 'label' ? { noteOn: a.label || a.id } : {}),
        ...(o.annotationGroups?.length && { noteGroups: groupsOf(o.annotationGroups, a) }),
      }
    : {};
