import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';

const reg = createRegistry();

const broken = {
  version: '1',
  type: 'flowchart',
  lanes: [{ id: 'ops', label: 'Ops' }],
  nodes: [
    { id: 'a', label: 'Start', lane: 'ops', shape: 'star', to: [{ node: 'zz' }, { node: 'c' }] },
    { label: 'no id', lane: 'ops' },
    { id: 'c', label: 'C', lane: 'nope' },
    { id: 'd', label: 'D', lane: 'ops', to: [{ node: 'a' }] },
  ],
};

describe('best-effort drawing (URS-WEB-032)', () => {
  it('draws what it can, leaving out what the errors point at', () => {
    expect(render(broken, reg).svg).toBeUndefined();
    const r = render(broken, reg, { bestEffort: true });
    expect(r.svg).toContain('id="n-d"');
    expect(r.partial).toBe(true);
    // A bad value goes on its own; an item that cannot stand (no id, unknown lane) goes whole, and so do links to it.
    expect(r.omitted).toEqual(expect.arrayContaining(['/nodes/0/shape', '/nodes/1', '/nodes/2']));
    expect(r.ir!.nodes.map((n) => n.id)).toEqual(['a', 'd']);
  });

  it('keeps every drawn element pointing at its place in the original source', () => {
    const r = render(broken, reg, { bestEffort: true });
    expect(r.ir!.nodes.map((n) => n.src)).toEqual(['/nodes/0', '/nodes/3']);
    expect(r.ir!.edges.map((e) => e.src)).toEqual(['/nodes/3/to/0']);
  });

  it('reports the same problems as a plain compile, not what follows from leaving things out', () => {
    expect(render(broken, reg, { bestEffort: true }).diagnostics).toEqual(compile(broken, reg).diagnostics);
  });

  it('changes nothing for a valid diagram, and gives up when there is nothing to draw', () => {
    const ok = reg.type('flowchart')!.examples[0]!.source;
    const r = render(ok, reg, { bestEffort: true });
    expect(r.partial).toBeUndefined();
    expect(r.svg).toBe(render(ok, reg).svg);
    expect(render({ version: '1', type: 'nope' }, reg, { bestEffort: true }).svg).toBeUndefined();
    expect(render({ version: '1', type: 'flowchart', nodes: 'x' }, reg, { bestEffort: true }).svg).toBeUndefined();
  });

  it.each(reg.types().map((t) => [t.id, t] as const))('%s: a stray property in any example draws exactly as without it', (_id, t) => {
    for (const ex of t.examples) {
      const doc = structuredClone(ex.source) as Record<string, unknown>;
      // The first list of items at the top, e.g. nodes, states, people, tasks: a property the schema does not allow.
      const list = Object.values(doc).find((v): v is Record<string, unknown>[] => Array.isArray(v) && typeof v[0] === 'object' && v[0] !== null);
      if (!list) continue;
      list[0]!.zzStray = true;
      const r = render(doc, reg, { bestEffort: true });
      expect(r.partial, ex.name).toBe(true);
      expect(r.svg, ex.name).toBe(render(ex.source, reg).svg);
    }
  });
});
