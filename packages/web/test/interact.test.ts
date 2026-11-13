import { compile } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { elementAt, labelTarget, pointerAt, related, setAt } from '../src/preview/interact.ts';
import { examples, pretty, registry } from '../src/registry.ts';

const doc = {
  version: '1',
  type: 'flowchart',
  nodes: [
    { id: 'a', label: 'Start here', to: [{ node: 'b', label: 'next' }] },
    { id: 'b', to: [{ node: 'a' }] },
  ],
};
const ir = compile(doc, registry).ir!;
const text = pretty(doc);

describe('interactive diagram (URS-WEB-020)', () => {
  it('finds the element the cursor is in: the deepest one', () => {
    expect(pointerAt(text, text.indexOf('"Start here"') + 2)).toBe('/nodes/0/label');
    expect(elementAt(ir, '/nodes/0/label')).toEqual({ kind: 'n', id: 'a' });
    expect(elementAt(ir, '/nodes/0/to/0/label')).toEqual({ kind: 'e', id: ir.edges[0]!.id });
    expect(elementAt(ir, '/version')).toBeUndefined();
  });

  it("lists a node's edges", () => {
    expect(related(ir, { kind: 'n', id: 'b' })).toEqual(ir.edges.map((e) => `e-${e.id}`));
    expect(related(ir, { kind: 'e', id: ir.edges[0]!.id })).toEqual([]);
  });

  it('finds where a shown label lives, whatever the type calls it', () => {
    expect(labelTarget(ir, doc, { kind: 'n', id: 'a' })).toEqual({ path: '/nodes/0/label', text: 'Start here' });
    expect(labelTarget(ir, doc, { kind: 'e', id: ir.edges[0]!.id })).toEqual({ path: '/nodes/0/to/0/label', text: 'next' });
    // A node showing its id gets a label property.
    expect(labelTarget(ir, doc, { kind: 'n', id: 'b' })).toEqual({ path: '/nodes/1/label', text: 'b' });
    // An unlabelled edge has nothing to edit.
    expect(labelTarget(ir, doc, { kind: 'e', id: ir.edges[1]!.id })).toBeUndefined();
    // Lifecycle verdicts call it "name".
    const cc = examples.find((e) => e.title === 'Object lifecycle')!.source;
    const lir = compile(cc, registry).ir!;
    expect(labelTarget(lir, cc, { kind: 'e', id: 'verdict:r_review:0' })).toEqual({ path: '/workflows/0/steps/2/verdicts/0/name', text: 'Approve' });
  });

  it('writes a label back without disturbing the rest of the text', () => {
    const out = setAt(text, '/nodes/1/label', 'Finish');
    expect(JSON.parse(out).nodes[1]).toEqual({ id: 'b', to: [{ node: 'a' }], label: 'Finish' });
    expect(setAt(text, '/nodes/0/label', 'Begin')).toBe(text.replace('Start here', 'Begin'));
  });

  it('every labelled element of every example resolves to its own text', () => {
    for (const ex of examples) {
      const g = compile(ex.source, registry).ir!;
      for (const n of g.nodes) {
        const t = labelTarget(g, ex.source, { kind: 'n', id: n.id });
        if (t) expect(t.text, `${ex.title} ${n.id}`).toBe(n.label);
      }
    }
  });
});
