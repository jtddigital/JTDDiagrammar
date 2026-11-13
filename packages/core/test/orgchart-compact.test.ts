import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';
import { teamStacks } from '../src/diagrams/orgchart/compact.ts';
import type { OrgChart } from '../src/diagrams/orgchart/model.ts';

const reg = createRegistry();
/** A director over two leaf teams (4 and 9 people) and one team with a sub-team. */
function chart(extra: Partial<OrgChart> = {}): OrgChart {
  const people: OrgChart['people'] = [{ id: 'd', name: 'Director' }];
  for (const [t, n] of [['a', 4], ['b', 9], ['c', 2]] as const) {
    people.push({ id: t, name: `Lead ${t}`, manager: 'd' });
    for (let i = 0; i < n; i++) people.push({ id: `${t}${i}`, name: `Person ${t}${i}`, manager: t });
  }
  people.push({ id: 'c0x', name: 'Sub', manager: 'c0' });
  return { version: '1', type: 'orgchart', people, ...extra };
}
const size = (d: object) => {
  const g = render(d, reg).geometry!;
  return { w: g.width, h: g.height };
};

describe('org chart: saving space (URS-TYP-014)', () => {
  it('stacks teams that manage no one to save width, and balances stacks to save height', () => {
    const stacks = (extra: Partial<OrgChart>) => Object.fromEntries([...teamStacks(chart(extra))].filter(([id]) => ['d', 'a', 'b', 'c'].includes(id)));
    expect(stacks({})).toEqual({ d: undefined, a: undefined, b: undefined, c: undefined });
    // Across: leaf teams stack in one column; the director's and c's teams have managers in them.
    expect(stacks({ compact: 'horizontal' })).toEqual({ d: undefined, a: 1, b: 1, c: undefined });
    // Both: leaf teams in a balanced grid.
    expect(stacks({ compact: 'both' })).toEqual({ d: undefined, a: 2, b: 3, c: undefined });
    // Down only: rows are already as short as they get; stacked teams spread into balanced columns.
    expect(stacks({ compact: 'vertical' })).toEqual({ d: undefined, a: undefined, b: undefined, c: undefined });
    expect(stacks({ compact: 'vertical', stack: true })).toEqual({ d: 2, a: 2, b: 3, c: 2 });
    // Left to right swaps the axes.
    expect(stacks({ compact: 'vertical', direction: 'LR' })).toEqual({ d: undefined, a: 1, b: 1, c: undefined });
  });

  it("leaves a person's own stack or multi, and the chart's multi, alone", () => {
    const c = chart({ compact: 'both' });
    c.people.find((p) => p.id === 'a')!.stack = false;
    c.people.find((p) => p.id === 'b')!.multi = 4;
    const s = teamStacks(c);
    expect([s.get('a'), s.get('b')]).toEqual([undefined, 4]);
    expect(teamStacks(chart({ compact: 'vertical', multi: 2 })).get('b')).toBe(2);
  });

  it('makes the chart narrower, shorter or both, as asked, in both directions', () => {
    for (const direction of ['TB', 'LR'] as const) {
      const none = size(chart({ direction }));
      const across = direction === 'TB' ? 'w' : 'h';
      const along = direction === 'TB' ? 'h' : 'w';
      const h = size(chart({ direction, compact: direction === 'TB' ? 'horizontal' : 'vertical' }));
      expect(h[across], direction).toBeLessThan(none[across] * 0.7);
      const v = size(chart({ direction, compact: direction === 'TB' ? 'vertical' : 'horizontal' }));
      expect(v[along], direction).toBeLessThan(none[along]);
      expect(v[across], direction).toBeLessThanOrEqual(none[across]);
      const both = size(chart({ direction, compact: 'both' }));
      expect(both.w * both.h, direction).toBeLessThan(none.w * none.h * 0.8);
    }
  });

  it('passes compact to the layout, and checks its value', () => {
    expect(compile(chart({ compact: 'both' }), reg).ir!.compact).toBe('both');
    expect(compile(chart(), reg).ir!.compact).toBeUndefined();
    expect(compile({ ...chart(), compact: 'diagonal' }, reg).diagnostics.map((d) => d.code)).toContain('schema.enum');
  });
});
