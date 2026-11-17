import type { Geometry, PlacedNotes } from '../geometry.ts';
import type { IRNode } from '../ir/types.ts';
import { lineHeight, textBlock } from '../measure/text.ts';
import { NOTE_FONT, NOTE_R, NOTE_TEXT_MAX, NOTES_GAP } from '../style.ts';

const PAD = 10;
const ROW_GAP = 8;
const TEXT_GAP = 6;
/** Indent per group level. */
const INDENT = 12;
const BOLD = { ...NOTE_FONT, bold: true };
export const NOTES_TITLE = 'Notes';

/** Every combination of one value per level: the heading paths a node's note goes under. */
const paths = (levels: readonly string[][]): string[][] => levels.reduce<string[][]>((acc, vals) => acc.flatMap((p) => vals.map((v) => [...p, v])), [[]]);

interface Group {
  groups: Map<string, Group>;
  notes: string[];
}
const group = (): Group => ({ groups: new Map(), notes: [] });

/**
 * Annotations (URS-DM-029), independent of the layout engine, as on an engineering drawing: notes are
 * listed in a box beside the diagram, top-aligned, and each node with a note gets the note's number (the
 * same text, the same number). With `noteGroups` the notes go under headings, level after level, in the
 * order the groups first appear (URS-DM-030); a note under several headings is listed under each. Notes
 * are numbered in the order they are listed. The geometry grows to hold the box.
 */
export function withNotes(g: Geometry, nodes: readonly IRNode[]): Geometry {
  const noted = nodes.filter((n) => n.note);
  if (!noted.length) return g;
  const root = group();
  const on = new Map<string, string[]>();
  for (const n of noted) {
    const text = n.note!;
    const names = on.get(text) ?? [];
    if (n.noteOn && !names.includes(n.noteOn)) names.push(n.noteOn);
    on.set(text, names);
    for (const p of paths(n.noteGroups ?? [])) {
      let at = root;
      for (const v of p) at = at.groups.get(v) ?? (at.groups.set(v, group()), at.groups.get(v)!);
      if (!at.notes.includes(text)) at.notes.push(text);
    }
  }

  const x = g.width + NOTES_GAP;
  const numbers = new Map<string, number>();
  const items: PlacedNotes['items'] = [];
  const heads: NonNullable<PlacedNotes['heads']> = [];
  let y = PAD + lineHeight(BOLD) + ROW_GAP;
  let w = 0;
  const walk = (at: Group, depth: number) => {
    for (const text of at.notes) {
      if (!numbers.has(text)) numbers.set(text, numbers.size + 1);
      const b = textBlock(text, NOTE_TEXT_MAX, NOTE_FONT);
      const names = on.get(text)!;
      const o = names.length ? textBlock(names.join(', '), NOTE_TEXT_MAX, BOLD) : undefined;
      const indent = depth * INDENT;
      items.push({ n: numbers.get(text)!, text, x: x + PAD + indent, y, lines: b.lines, ...(o && { on: o.lines }) });
      y += Math.max(2 * NOTE_R, b.height + (o?.height ?? 0)) + ROW_GAP;
      w = Math.max(w, indent + 2 * NOTE_R + TEXT_GAP + Math.max(b.width, o?.width ?? 0));
    }
    for (const [name, sub] of at.groups) {
      const h = textBlock(name, NOTE_TEXT_MAX, BOLD);
      heads.push({ x: x + PAD + depth * INDENT, y, lines: h.lines, level: depth });
      y += h.height + ROW_GAP / 2;
      w = Math.max(w, depth * INDENT + h.width);
      walk(sub, depth + 1);
    }
  };
  walk(root, 0);
  const notes: PlacedNotes = { x, y: 0, w: 2 * PAD + w, h: y - ROW_GAP + PAD, items, ...(heads.length && { heads }) };
  return {
    ...g,
    width: notes.x + notes.w,
    height: Math.max(g.height, notes.h),
    nodes: g.nodes.map((n) => {
      const note = nodes.find((m) => m.id === n.id)?.note;
      return note && numbers.has(note) ? { ...n, note: numbers.get(note)! } : n;
    }),
    notes,
  };
}

/** Where the note text starts, right of its number balloon. */
export const NOTE_TEXT_X = 2 * NOTE_R + TEXT_GAP;
