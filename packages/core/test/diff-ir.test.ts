import { describe, expect, it } from 'vitest';
import { compile, createRegistry, diffIR, type GraphIR } from '../src/index.ts';

const reg = createRegistry();
const ir = (doc: unknown): GraphIR => {
  const r = compile(doc, reg);
  if (!r.ir) throw new Error(JSON.stringify(r.diagnostics));
  return r.ir;
};
const clone = <T>(x: T): T => structuredClone(x);

describe('diagram comparison by element identity (URS-WS-035, D-008)', () => {
  it('finds no change between a diagram and itself, for every example of every type', () => {
    for (const type of reg.types())
      for (const ex of type.examples) {
        const a = ir(ex.source);
        expect(diffIR(a, ir(clone(ex.source))).changes, `${type.id}: ${ex.name}`).toEqual([]);
      }
  });

  it('reports added, removed and changed elements of any type, and marks them on each side', () => {
    for (const type of reg.types()) {
      const a = ir(type.examples[0].source);
      if (a.nodes.length < 2) continue;
      const b = clone(a);
      const [first, last] = [b.nodes[0]!, b.nodes.at(-1)!];
      first.label = `${first.label} (new)`;
      b.nodes.pop();
      b.edges = b.edges.filter((e) => e.from !== last.id && e.to !== last.id);
      b.nodes.push({ id: 'zz-added', shape: first.shape, label: 'Added', ...(first.lane && { lane: first.lane }), ...(first.phase && { phase: first.phase }) });
      const d = diffIR(a, b);
      const nodes = d.changes.filter((c) => c.kind === 'n');
      expect(nodes.map((c) => [c.type, c.a ?? c.b]), type.id).toEqual([
        ['changed', first.id],
        ['removed', last.id],
        ['added', 'zz-added'],
      ]);
      expect(d.marksA[`n-${last.id}`]).toBe('removed');
      expect(d.marksA[`n-${first.id}`]).toBe('changed');
      expect(d.marksB[`n-zz-added`]).toBe('added');
      expect(nodes[0]!.fields).toEqual([{ field: 'label', before: a.nodes[0]!.label, after: first.label }]);
    }
  });

  it('matches links by their ends, so removing one does not shift the rest; describes changes in words', () => {
    const doc = {
      version: '1',
      type: 'flowchart',
      lanes: [{ id: 'ops', label: 'Operations' }, { id: 'fin', label: 'Finance' }],
      nodes: [
        { id: 'a', label: 'Submit', lane: 'ops', to: [{ node: 'b' }, { node: 'c', label: 'urgent' }] },
        { id: 'b', label: 'Check', lane: 'ops' },
        { id: 'c', label: 'Pay', lane: 'fin' },
      ],
    };
    const next: typeof doc & { title?: string } = clone(doc);
    next.title = 'Payments';
    next.nodes[0]!.to = [{ node: 'c', label: 'rush' }];
    next.nodes[1]!.label = 'Review';
    next.nodes[2]!.lane = 'ops';
    const d = diffIR(ir(doc), ir(next));
    expect(d.changes.map((c) => c.text)).toEqual(['Diagram: title set to “Payments”', 'Node “Review”: label “Check” → “Review”', 'Node “Pay”: lane “Finance” → “Operations”', 'Link “Submit” → “Check” removed', 'Link “Submit” → “Pay”: labels “urgent” → “rush”']);
    // Each change points at its source on each side.
    expect(d.changes[1]).toMatchObject({ srcA: '/nodes/1', srcB: '/nodes/1' });
    expect(d.changes[4]).toMatchObject({ a: 'edge:a:1', b: 'edge:a:0' });
    expect(d.marksB['e-edge:a:0']).toBe('changed');
    expect(d.marksA['e-edge:a:0']).toBe('removed');
  });

  it('marks the changed cells of a timeline table, and lists them by column (Gantt)', () => {
    const doc = {
      version: '1',
      type: 'gantt',
      start: '2026-03-02',
      columns: ['name', 'owner', 'duration'],
      tasks: [
        { id: 'plan', name: 'Plan', owner: 'Ann', duration: 3 },
        { id: 'build', name: 'Build', owner: 'Ann', duration: 5, after: ['plan'] },
      ],
    };
    const next = clone(doc);
    next.tasks[1]!.owner = 'Bob';
    next.tasks.push({ id: 'ship', name: 'Ship', owner: 'Cy', duration: 1, after: ['build'] });
    const d = diffIR(ir(doc), ir(next));
    const build = d.changes.find((c) => c.kind === 'n' && c.b === 'build')!;
    expect(build.text).toBe('Node “Build”: Owner “Ann” → “Bob”');
    expect(d.marksA['t-build--owner']).toBe('changed');
    expect(d.marksB['t-build--owner']).toBe('changed');
    // Unchanged cells of a changed row stay unmarked.
    expect(d.marksB['t-build--name']).toBeUndefined();
    // A new row's cells are all added.
    expect(d.marksB['t-ship--name']).toBe('added');
    expect(d.marksB['t-ship--owner']).toBe('added');
  });
});
