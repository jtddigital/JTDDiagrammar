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

  it('are offered by every diagram type', () => {
    expect(editable.map((t) => t.id).sort()).toEqual(reg.types().map((t) => t.id).sort());
  });

  it.each(editable.map((t) => [t.id, t] as const))('%s: every addition, to every example, keeps the diagram valid, and draws (unless the view hides it)', (_id, t) => {
    for (const a of t.edit!.add) {
      let drawn = 0;
      let tried = 0;
      for (const ex of t.examples) {
        if (a.available && !a.available(ex.source as never)) continue;
        tried++;
        const doc = apply(ex.source, a.make('zz-new', ex.source as never));
        expect(errors(doc), `${ex.name}: ${a.label}`).toEqual([]);
        if (compile(doc, reg).ir?.nodes.some((n) => /zz.new/i.test(n.id))) drawn++;
      }
      if (tried) expect(drawn, `${a.label} draws in some example`).toBeGreaterThan(0);
    }
  });

  it.each(editable.map((t) => [t.id, t] as const))('%s: something added can be connected from an existing element, drawing a link, and stays valid', (_id, t) => {
    let done = false;
    for (const ex of t.examples) {
      for (const a of t.edit!.add) {
        if (done || (a.available && !a.available(ex.source as never))) continue;
        const doc = apply(ex.source, a.make('zz-new', ex.source as never));
        const ir = compile(doc, reg).ir!;
        const added = ir.nodes.filter((n) => /zz-new/i.test(n.id) || /zz.new/i.test(n.label));
        for (const n of added)
          for (const o of ir.nodes) {
            if (done || o === n) continue;
            const e = t.edit!.connect!(doc as never, { id: o.id, ...(o.src && { src: o.src }) }, { id: n.id, ...(n.src && { src: n.src }) });
            if (!e) continue;
            const linked = apply(doc, e);
            expect(errors(linked), `${ex.name}: ${a.label} from ${o.id}`).toEqual([]);
            expect(compile(linked, reg).ir!.edges.length, `${ex.name}: ${a.label} from ${o.id}`).toBeGreaterThan(ir.edges.length);
            done = true;
          }
      }
    }
    expect(done, 'some addition could be connected').toBe(true);
  });

  it('offers an initial state only where there is none yet', () => {
    const initial = reg.type('state')!.edit!.add.find((a) => a.label === 'Initial')!;
    expect(initial.available!({ version: '1', type: 'state', states: [{ id: 'a' }] } as never)).toBe(true);
    expect(initial.available!({ version: '1', type: 'state', states: [{ id: 'i', kind: 'initial' }] } as never)).toBe(false);
  });

  it('refuses connections that make no sense', () => {
    const state = reg.type('state')!.edit!;
    const doc = { version: '1', type: 'state', states: [{ id: 'i', kind: 'initial' }, { id: 'a' }, { id: 'f', kind: 'final' }] };
    expect(state.connect!(doc as never, { id: 'f' }, { id: 'a' })).toBeUndefined();
    expect(state.connect!(doc as never, { id: 'a' }, { id: 'i' })).toBeUndefined();
    expect(state.connect!(doc as never, { id: 'a' }, { id: 'missing' })).toBeUndefined();
    const gantt = reg.type('gantt')!.edit!;
    const g = { version: '1', type: 'gantt', start: '2026-03-02', tasks: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', after: ['a FS+1'] }] };
    expect(gantt.connect!(g as never, { id: 'a' }, { id: 'b' })).toBeUndefined();
    expect(gantt.connect!(g as never, { id: 'b' }, { id: 'b' })).toBeUndefined();
  });
});
