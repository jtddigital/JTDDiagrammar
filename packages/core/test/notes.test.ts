import { describe, expect, it } from 'vitest';
import type { Geometry } from '../src/geometry.ts';
import { createRegistry, render } from '../src/index.ts';
import type { IRNode } from '../src/ir/types.ts';
import { withNotes } from '../src/layout/notes.ts';

const node = (id: string, x: number) => ({ id, shape: 'process', lines: [id], x, y: 10, w: 80, h: 40 });
const geo: Geometry = { width: 300, height: 60, bands: [], containers: [], nodes: [node('a', 0), node('b', 100), node('c', 200)], edges: [] };
const ir = (notes: Record<string, string>): IRNode[] => geo.nodes.map((n) => ({ id: n.id, shape: 'process', label: n.id, ...(notes[n.id] && { note: notes[n.id] }) }));

describe('annotations (URS-DM-029)', () => {
  it('numbers annotated nodes in order, one number per text, and lists them beside the diagram', () => {
    const g = withNotes(geo, ir({ a: 'First note', b: 'Second note', c: 'First note' }));
    expect(g.nodes.map((n) => n.note)).toEqual([1, 2, 1]);
    expect(g.notes!.items.map((i) => [i.n, i.lines])).toEqual([
      [1, ['First note']],
      [2, ['Second note']],
    ]);
    // Top-aligned to the right of the drawing, which grows to hold it.
    expect(g.notes!.x).toBeGreaterThan(geo.width);
    expect(g.notes!.y).toBe(0);
    expect(g.width).toBe(g.notes!.x + g.notes!.w);
    expect(g.height).toBeGreaterThanOrEqual(g.notes!.h);
  });

  it('names what each note is attached to, every shape sharing it once, when the type says', () => {
    const nodes = ir({ a: 'Shared', b: 'Shared', c: 'Own' }).map((n) => ({ ...n, noteOn: n.id === 'c' ? undefined : n.id.toUpperCase() }));
    const g = withNotes(geo, [...nodes, { ...nodes[0]!, id: 'a2' }]);
    expect(g.notes!.items.map((i) => [i.on, i.lines])).toEqual([
      [['A, B'], ['Shared']],
      [undefined, ['Own']],
    ]);
    // Taller by the name's line.
    expect(g.notes!.items[1]!.y - g.notes!.items[0]!.y).toBeGreaterThan(withNotes(geo, ir({ a: 'Shared', c: 'Own' })).notes!.items[1]!.y - withNotes(geo, ir({ a: 'Shared', c: 'Own' })).notes!.items[0]!.y);
  });

  it('groups notes under headings level after level, numbered in listed order (URS-DM-030)', () => {
    const groups: Record<string, string[][]> = { a: [['Task'], ['QA']], b: [['Gate'], ['No owner']], c: [['Task'], ['Owner']] };
    const nodes = ir({ a: 'A note', b: 'B note', c: 'C note' }).map((n) => ({ ...n, noteGroups: groups[n.id]! }));
    const g = withNotes(geo, nodes);
    expect(g.notes!.heads!.map((h) => [h.lines[0], h.level])).toEqual([
      ['Task', 0],
      ['QA', 1],
      ['Owner', 1],
      ['Gate', 0],
      ['No owner', 1],
    ]);
    // Listed by group, so numbered by group: A, C (both tasks), then B; markers follow.
    expect(g.notes!.items.map((i) => [i.n, i.text])).toEqual([
      [1, 'A note'],
      [2, 'C note'],
      [3, 'B note'],
    ]);
    expect(g.nodes.map((n) => n.note)).toEqual([1, 3, 2]);
    // Indented under their headings.
    expect(g.notes!.items[0]!.x).toBeGreaterThan(g.notes!.heads![1]!.x);
  });

  it('lists a note with several values under each, with one number', () => {
    const nodes = ir({ a: 'Tagged twice' }).map((n) => ({ ...n, noteGroups: [['Compliance', 'Cost']] }));
    const g = withNotes(geo, nodes);
    expect(g.notes!.heads!.map((h) => h.lines[0])).toEqual(['Compliance', 'Cost']);
    expect(g.notes!.items.map((i) => i.n)).toEqual([1, 1]);
  });

  it('wraps long notes and leaves a drawing without annotations alone', () => {
    const g = withNotes(geo, ir({ a: 'word '.repeat(80).trim() }));
    expect(g.notes!.items[0]!.lines.length).toBeGreaterThan(1);
    expect(withNotes(geo, ir({}))).toBe(geo);
  });

  it('draws a numbered balloon, its note as a tooltip, on the node and the notes box (URS-RN-001)', () => {
    const reg = createRegistry();
    const doc = { version: '1', type: 'lifecycle', states: [{ id: 'a', stateType: 'initial', annotation: 'Kept for 10 years', to: [{ state: 'b' }] }, { id: 'b' }] };
    const svg = render(doc, reg).svg!;
    expect(svg).toMatch(/<g id="n-state:a"[^]*?<g class="jtd-note-marker">[^]*?>1<\/text><\/g><\/g>/);
    expect(svg).toMatch(/<g class="jtd-notes">[^]*>Notes<\/text>[^]*>Kept for 10 years<\/text><\/g>/);
    // Hovering a marker shows its note, on the node and in the notes box.
    expect(svg.match(/<g class="jtd-note-marker"><title>Kept for 10 years<\/title>/g)).toHaveLength(2);
  });
});
