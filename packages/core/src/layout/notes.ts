import type { Geometry, PlacedNotes } from '../geometry.ts';
import type { IRNode } from '../ir/types.ts';
import { lineHeight, textBlock } from '../measure/text.ts';
import { NOTE_FONT, NOTE_R, NOTE_TEXT_MAX, NOTES_GAP } from '../style.ts';

const PAD = 10;
const ROW_GAP = 8;
const TEXT_GAP = 6;
export const NOTES_TITLE = 'Notes';

/**
 * Annotations (URS-DM-029), independent of the layout engine, as on an engineering drawing: each node with
 * a note gets a number, in node order (the same text, the same number), and the notes are listed by number
 * in a box beside the diagram, top-aligned. The geometry grows to hold it.
 */
export function withNotes(g: Geometry, nodes: readonly IRNode[]): Geometry {
  const texts: string[] = [];
  const numbers = new Map<string, number>();
  // What each note is attached to, when named: every shape sharing it, once each.
  const on: string[][] = [];
  for (const n of nodes) {
    if (!n.note) continue;
    let i = texts.indexOf(n.note);
    if (i < 0) on[(i = texts.push(n.note) - 1)] = [];
    numbers.set(n.id, i + 1);
    if (n.noteOn && !on[i]!.includes(n.noteOn)) on[i]!.push(n.noteOn);
  }
  if (!texts.length) return g;
  const x = g.width + NOTES_GAP;
  const head = lineHeight({ ...NOTE_FONT, bold: true });
  let y = PAD + head + ROW_GAP;
  let w = 0;
  const items: PlacedNotes['items'] = texts.map((t, i) => {
    const b = textBlock(t, NOTE_TEXT_MAX, NOTE_FONT);
    const o = on[i]!.length ? textBlock(on[i]!.join(', '), NOTE_TEXT_MAX, { ...NOTE_FONT, bold: true }) : undefined;
    const item = { n: i + 1, text: t, x: x + PAD, y, lines: b.lines, ...(o && { on: o.lines }) };
    y += Math.max(2 * NOTE_R, b.height + (o?.height ?? 0)) + ROW_GAP;
    w = Math.max(w, b.width, o?.width ?? 0);
    return item;
  });
  const notes: PlacedNotes = { x, y: 0, w: 2 * PAD + 2 * NOTE_R + TEXT_GAP + w, h: y - ROW_GAP + PAD, items };
  return {
    ...g,
    width: notes.x + notes.w,
    height: Math.max(g.height, notes.h),
    nodes: g.nodes.map((n) => (numbers.has(n.id) ? { ...n, note: numbers.get(n.id)! } : n)),
    notes,
  };
}

/** Where the note text starts, right of its number balloon. */
export const NOTE_TEXT_X = 2 * NOTE_R + TEXT_GAP;
