import { describe, expect, it } from 'vitest';
import { compile, createRegistry, type SourceEdit } from '../src/index.ts';

const reg = createRegistry();
const clone = <T>(x: T): T => structuredClone(x);
const errors = (doc: unknown) => compile(doc, reg).diagnostics.filter((d) => d.severity === 'error');

/** Apply a source edit to a parsed document, as the web app does to the text. */
function apply(doc: unknown, e: SourceEdit): unknown {
  const out = clone(doc) as Record<string, unknown>;
  const segs = e.at.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent: Record<string, unknown> | unknown[] = out;
  for (const s of segs.slice(0, -1)) parent = (parent as Record<string, unknown>)[s] as Record<string, unknown>;
  const last = segs.at(-1)!;
  const holder = parent as Record<string, unknown>;
  if (e.append) holder[last] = [...((holder[last] as unknown[] | undefined) ?? []), e.value];
  else holder[last] = e.value;
  return out;
}

describe('editing assets (URS-EXT-012, WEB-026)', () => {
  const editable = reg.types().filter((t) => t.edit);

  it('are offered by the flowchart, state, org chart and Gantt types', () => {
    expect(editable.map((t) => t.id).sort()).toEqual(['flowchart', 'gantt', 'orgchart', 'state']);
  });

  it.each(editable.map((t) => [t.id, t] as const))('%s: every addition, to every example, keeps the diagram valid', (_id, t) => {
    for (const ex of t.examples)
      for (const a of t.edit!.add) {
        if (a.available && !a.available(ex.source as never)) continue;
        const doc = apply(ex.source, a.make('zz-new', ex.source as never));
        expect(errors(doc), `${ex.name}: ${a.label}`).toEqual([]);
        expect(compile(doc, reg).ir?.nodes.some((n) => n.id === 'zz-new'), `${ex.name}: ${a.label} drawn`).toBe(true);
      }
  });

  it.each(editable.map((t) => [t.id, t] as const))('%s: connecting a new element to an existing one draws a link and stays valid', (_id, t) => {
    const ex = t.examples[0];
    const doc = apply(ex.source, t.edit!.add[0]!.make('zz-new', ex.source as never));
    const before = compile(doc, reg).ir!;
    const other = before.nodes.find((n) => n.id !== 'zz-new' && t.edit!.connect!(doc as never, n.id, 'zz-new'))!;
    expect(other, 'some node can connect to the new one').toBeDefined();
    const linked = apply(doc, t.edit!.connect!(doc as never, other.id, 'zz-new')!);
    expect(errors(linked)).toEqual([]);
    const ir = compile(linked, reg).ir!;
    expect(ir.edges.some((e) => e.from === other.id && e.to === 'zz-new')).toBe(true);
  });

  it('offers an initial state only where there is none yet', () => {
    const initial = reg.type('state')!.edit!.add.find((a) => a.label === 'Initial')!;
    expect(initial.available!({ version: '1', type: 'state', states: [{ id: 'a' }] } as never)).toBe(true);
    expect(initial.available!({ version: '1', type: 'state', states: [{ id: 'i', kind: 'initial' }] } as never)).toBe(false);
  });

  it('refuses connections that make no sense', () => {
    const state = reg.type('state')!.edit!;
    const doc = { version: '1', type: 'state', states: [{ id: 'i', kind: 'initial' }, { id: 'a' }, { id: 'f', kind: 'final' }] };
    expect(state.connect!(doc as never, 'f', 'a')).toBeUndefined();
    expect(state.connect!(doc as never, 'a', 'i')).toBeUndefined();
    expect(state.connect!(doc as never, 'a', 'missing')).toBeUndefined();
    const gantt = reg.type('gantt')!.edit!;
    const g = { version: '1', type: 'gantt', start: '2026-03-02', tasks: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', after: ['a FS+1'] }] };
    expect(gantt.connect!(g as never, 'a', 'b')).toBeUndefined();
    expect(gantt.connect!(g as never, 'b', 'b')).toBeUndefined();
  });
});
