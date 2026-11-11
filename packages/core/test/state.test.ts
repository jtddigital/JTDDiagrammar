import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';
import { stateAi } from '../src/diagrams/state/ai.ts';

const reg = createRegistry();
const doc = (states: unknown[], transitions: unknown[] = []) => ({ version: '1', type: 'state', states, transitions });
const codes = (d: unknown) => compile(d, reg).diagnostics.map((x) => [x.severity, x.code, x.path]);

describe('state type (URS-TYP-003..005)', () => {
  it('compiles every example without diagnostics', () => {
    for (const ex of reg.type('state')!.examples) expect(render(ex.source, reg).diagnostics, ex.name).toEqual([]);
  });

  it('maps composite states to containers and pseudostates to their shapes', () => {
    const { ir } = compile(
      doc(
        [{ id: 'i', kind: 'initial' }, { id: 'c', label: 'Comp', states: [{ id: 'a' }, { id: 'f', kind: 'final' }] }, { id: 'x', kind: 'choice' }],
        [{ from: 'i', to: 'c' }, { from: 'a', to: 'x', event: 'go', guard: 'ok', action: 'log()' }, { from: 'x', to: 'f' }, { from: 'x', to: 'a' }],
      ),
      reg,
    );
    expect(ir!.containers).toEqual([{ id: 'c', label: 'Comp', src: '/states/1' }]);
    expect(ir!.nodes.map((n) => [n.id, n.shape, n.label, n.parent])).toEqual([
      ['i', 'initial', '', undefined],
      ['a', 'state', 'a', 'c'],
      ['f', 'final', '', 'c'],
      ['x', 'choice', '', undefined],
    ]);
    expect(ir!.edges[1]!.label).toBe('go [ok] / log()');
  });

  it('applies pseudostate rules', () => {
    expect(
      codes(
        doc(
          [{ id: 'i', kind: 'initial' }, { id: 'i2', kind: 'initial' }, { id: 'a' }, { id: 'f', kind: 'final', states: [{ id: 'z' }] }, { id: 'ch', kind: 'choice' }],
          [{ from: 'a', to: 'i' }, { from: 'f', to: 'a' }, { from: 'i2', to: 'a' }, { from: 'ch', to: 'a' }],
        ),
      ),
    ).toEqual([
      ['error', 'state.initial', '/states/0'],
      ['warning', 'state.initial', '/states/0'],
      ['error', 'state.initial', '/states/1'],
      ['error', 'state.nested', '/states/3/states'],
      ['error', 'state.final', '/states/3'],
      ['warning', 'state.choice', '/states/4'],
    ]);
  });

  it('allows one initial state per region and transitions to and from composites', () => {
    const d = doc(
      [{ id: 'i', kind: 'initial' }, { id: 'c', states: [{ id: 'i2', kind: 'initial' }, { id: 'a' }] }, { id: 'b' }],
      [{ from: 'i', to: 'c' }, { from: 'i2', to: 'a' }, { from: 'c', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'b', event: 'tick' }],
    );
    expect(render(d, reg).diagnostics).toEqual([]);
  });

  it('nests generated flat states by parent; unknown and cyclic parents fall back to the top level (URS-AI-004)', () => {
    const out = stateAi.fromGenerated({
      title: 't',
      direction: 'LR',
      states: [
        { id: 'c', kind: 'state', label: 'C' },
        { id: 'a', kind: 'state', label: 'A', parent: 'c' },
        { id: 'p', kind: 'initial', label: '', parent: 'c' },
        { id: 'o', kind: 'state', label: 'O', parent: 'nope' },
        { id: 'x', kind: 'state', label: 'X', parent: 'y' },
        { id: 'y', kind: 'state', label: 'Y', parent: 'x' },
      ],
      transitions: [],
    });
    expect(out.states).toEqual([
      { id: 'c', label: 'C', states: [{ id: 'a', label: 'A' }, { id: 'p', kind: 'initial' }] },
      { id: 'o', label: 'O' },
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ]);
  });
});
