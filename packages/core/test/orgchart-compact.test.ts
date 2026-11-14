import { describe, expect, it } from 'vitest';
import { compile, createRegistry, render } from '../src/index.ts';
import { teamStacks } from '../src/diagrams/orgchart/compact.ts';
import type { OrgChart } from '../src/diagrams/orgchart/model.ts';
import { balance } from '../src/layout/tree/arrange.ts';

const reg = createRegistry();
/** A CEO over five departments, each a VP over two or three teams of two to six (URS-TYP-012). */
function chart(extra: Partial<OrgChart> = {}): OrgChart {
  const people: OrgChart['people'] = [{ id: 'ceo', name: 'Chief executive' }];
  [3, 2, 3, 2, 3].forEach((teams, d) => {
    people.push({ id: `vp${d}`, name: `VP ${d}`, manager: 'ceo', department: `Dept ${d}` });
    for (let t = 0; t < teams; t++) {
      const m = `m${d}${t}`;
      people.push({ id: m, name: `Manager ${d}.${t}`, manager: `vp${d}`, department: `Dept ${d}` });
      for (let i = 0; i < 2 + ((d + t) % 5); i++) people.push({ id: `${m}p${i}`, name: `Person ${i}`, manager: m, department: `Dept ${d}` });
    }
  });
  return { version: '1', type: 'orgchart', people, ...extra };
}
const drawn = (d: object) => render(d, reg).geometry!;

describe('org chart: saving space (URS-TYP-014, URS-LY-014)', () => {
  it('lets the layout arrange teams, unless a person sets their own', () => {
    const c = chart({ compact: 'both', stack: true, multi: 3 });
    c.people.find((p) => p.id === 'vp0')!.stack = false;
    c.people.find((p) => p.id === 'vp1')!.stack = true;
    c.people.find((p) => p.id === 'vp2')!.multi = 4;
    const s = teamStacks(c);
    // The chart's own stack and multi give way; a person's own settings win (0: keep a row).
    expect([s.get('ceo'), s.get('vp0'), s.get('vp1'), s.get('vp2'), s.get('vp3')]).toEqual([undefined, 0, 1, 4, undefined]);
    // Without compact, as before.
    expect(teamStacks(chart({ stack: true })).get('ceo')).toBe(1);
    expect(teamStacks(chart()).get('ceo')).toBeUndefined();
  });

  it('moves department boxes into a grid, making the chart smaller, in both directions', () => {
    for (const direction of ['TB', 'LR'] as const) {
      const none = drawn(chart({ direction }));
      const both = drawn(chart({ direction, compact: 'both' }));
      expect(both.width * both.height, direction).toBeLessThan(none.width * none.height * 0.9);
      // Without saving space the departments sit in one line; with it they wrap into more than one.
      const lines = (g: typeof none) => new Set(g.containers.map((b) => Math.round(direction === 'TB' ? b.y : b.x))).size;
      const top = (g: typeof none) => ({ ...g, containers: g.containers.filter((b) => b.depth === 0) });
      expect(lines(top(none)), direction).toBe(1);
      expect(lines(top(both)), direction).toBeGreaterThan(1);
    }
  });

  it('keeps a narrow chart no wider than tall, and a short one no taller than wide', () => {
    for (const direction of ['TB', 'LR'] as const) {
      const none = drawn(chart({ direction }));
      const h = drawn(chart({ direction, compact: 'horizontal' }));
      expect(h.width, direction).toBeLessThanOrEqual(h.height);
      expect(h.width, direction).toBeLessThanOrEqual(none.width);
      const v = drawn(chart({ direction, compact: 'vertical' }));
      expect(v.height, direction).toBeLessThanOrEqual(v.width);
      expect(v.height, direction).toBeLessThanOrEqual(none.height);
    }
  });

  it('splits a stack into columns as even in height as order allows', () => {
    const hs = (cols: { h: number }[][]) => cols.map((c) => c.map((x) => x.h));
    const ten = Array.from({ length: 7 }, () => ({ h: 10 }));
    // Equal heights: earlier columns take the extra, as before.
    expect(hs(balance(ten, 3, 0)).map((c) => c.length)).toEqual([3, 3, 1]);
    const cols = balance([{ h: 300 }, { h: 50 }, { h: 50 }, { h: 50 }, { h: 50 }, { h: 50 }, { h: 50 }], 2, 10);
    expect(hs(cols)).toEqual([[300], [50, 50, 50, 50, 50, 50]]);
    expect(balance([{ h: 1 }, { h: 1 }], 5, 0)).toHaveLength(2);
    // Order is kept.
    expect(cols.flat().map((x) => x.h)).toEqual([300, 50, 50, 50, 50, 50, 50]);
  });

  it('passes compact to the layout, and checks its value', () => {
    expect(compile(chart({ compact: 'both' }), reg).ir!.compact).toBe('both');
    expect(compile(chart(), reg).ir!.compact).toBeUndefined();
    expect(compile({ ...chart(), compact: 'diagonal' }, reg).diagnostics.map((d) => d.code)).toContain('schema.enum');
  });
});
