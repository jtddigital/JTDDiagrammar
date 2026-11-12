import { compile } from '@jtd/core';
import { describe, expect, it } from 'vitest';
import { locate } from '../src/editor/locate.ts';
import { pointerOf } from '../src/pick.ts';
import { examples, pretty, registry } from '../src/registry.ts';

describe('click to source (URS-WEB-009)', () => {
  it('maps every drawn element of every example to its source', () => {
    for (const ex of examples) {
      const ir = compile(ex.source, registry).ir!;
      const text = pretty(ex.source);
      const p = ir.partitions;
      const all: [string, { id: string }[]][] = [['n', ir.nodes], ['c', ir.containers], ['e', ir.edges], ['l', p?.lanes ?? []], ['p', p?.phases ?? []], ['lg', p?.laneGroups ?? []], ['pg', p?.phaseGroups ?? []]];
      for (const [kind, list] of all)
        for (const x of list) {
          const path = pointerOf(ir, kind, x.id);
          expect(path, `${ex.title} ${kind}-${x.id}`).toMatch(/^\/[a-zA-Z]+\/\d+/);
          const r = locate(text, { code: 'pick', path: path! });
          expect(r.to).toBeGreaterThan(r.from);
        }
    }
  });

  it('returns undefined for unknown elements', () => {
    const ir = compile(examples[0]!.source, registry).ir!;
    expect(pointerOf(ir, 'n', 'nope')).toBeUndefined();
    expect(pointerOf(ir, 'x', ir.nodes[0]!.id)).toBeUndefined();
  });
});
