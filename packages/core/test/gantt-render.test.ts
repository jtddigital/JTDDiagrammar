import { describe, expect, it } from 'vitest';
import { dayOf } from '../src/diagrams/gantt/dates.ts';
import type { Gantt, Item } from '../src/diagrams/gantt/model.ts';
import { compile, createRegistry, parseXml, render, toXml } from '../src/index.ts';
import { quality } from '../src/layout/metrics.ts';
import { scale } from '../src/layout/timeline/scale.ts';

const reg = createRegistry();
const plan = (tasks: Item[], extra: Partial<Gantt> = {}): Gantt => ({ version: '1', type: 'gantt', start: '2027-01-04', tasks, ...extra });
const ir = (g: Gantt) => compile(g, reg).ir!;
const drawn = (g: Gantt) => render(g, reg).geometry!;
const node = (g: ReturnType<typeof drawn>, id: string) => g.nodes.find((n) => n.id === id)!;

describe('gantt chart (URS-TYP-015, URS-TYP-017)', () => {
  it('draws each kind in its shape, and lists every item in the table in outline order', () => {
    const r = ir(
      plan([
        { id: 'p', name: 'Phase', tasks: [{ id: 't', name: 'Task', duration: 2 }, { id: 'b', name: 'Buffer', type: 'buffer', duration: 1 }] },
        { id: 'm', name: 'Milestone', type: 'milestone' },
        { id: 'd', name: 'Deliverable', type: 'deliverable' },
        { id: 'g', name: 'Gate', type: 'gate' },
        { id: 'x', name: 'External', type: 'external', duration: 1, owner: 'Vendor' },
      ]),
    );
    expect(r.nodes.map((n) => [n.id, n.shape, n.depth, n.cells!.wbs])).toEqual([
      ['p', 'summary', 0, '1'],
      ['t', 'task', 1, '1.1'],
      ['b', 'buffer', 1, '1.2'],
      ['m', 'milestone', 0, '2'],
      ['d', 'deliverable', 0, '3'],
      ['g', 'gate', 0, '4'],
      ['x', 'task', 0, '5'],
    ]);
    expect(r.nodes[0]!.strong).toBe(true);
    expect(r.nodes[6]!.cells).toEqual({ wbs: '5', name: 'External', owner: 'Vendor', start: '2027-01-04', end: '2027-01-04', duration: '1' });
    expect(r.nodes[6]!.style).toEqual({ dash: 'dashed' });
  });

  it('styles by layer: tasks, type, owner, tags in order, then the item itself', () => {
    const r = ir(
      plan(
        [
          { id: 'a', name: 'A', duration: 1, owner: 'Ops', tags: ['x', 'y'], style: { bold: true } },
          { id: 'b', name: 'B', duration: 1, owner: 'Ops' },
          { id: 'c', name: 'C', duration: 1, type: 'external' },
        ],
        {
          styles: { tasks: { fill: '#111111', fontSize: 10 }, links: { stroke: '#222222' } },
          styleBy: { type: { task: { fill: '#333333', stroke: '#333333' }, external: { stroke: '#444444' } }, owner: { Ops: { fill: '#555555', italic: true } } },
          tags: { x: { stroke: '#666666', lineWidth: 3 }, y: { stroke: '#777777' } },
        },
      ),
    );
    const style = (id: string) => r.nodes.find((n) => n.id === id)!.style;
    expect(style('a')).toEqual({ fill: '#555555', fontSize: 10, stroke: '#777777', italic: true, lineWidth: 3, bold: true });
    expect(style('b')).toEqual({ fill: '#555555', fontSize: 10, stroke: '#333333', italic: true });
    expect(style('c')).toEqual({ dash: 'dashed', fill: '#111111', fontSize: 10, stroke: '#444444' });
  });

  it('draws a legend of the kinds used (when more than one), styled owners and styled tags in use', () => {
    const g = plan(
      [
        { id: 'a', name: 'A', duration: 1, owner: 'Ops', tags: ['hot'] },
        { id: 'm', name: 'M', type: 'milestone', after: ['a'] },
      ],
      { styleBy: { owner: { Ops: { fill: '#eeeeee' }, Idle: { fill: '#000000' } } }, tags: { hot: { stroke: '#ff0000' } } },
    );
    expect(ir(g).legend!.map((l) => [l.label, l.shape])).toEqual([
      ['Task', 'task'],
      ['Milestone', 'milestone'],
      ['Ops', 'task'],
      ['hot', 'task'],
    ]);
    expect(ir({ ...g, legend: false }).legend).toBeUndefined();
    expect(ir(plan([{ id: 'a', name: 'A', duration: 1 }])).legend).toBeUndefined();
    // An unused styled tag is a warning, as for org charts.
    expect(compile(plan([{ id: 'a', name: 'A', duration: 1 }], { tags: { spare: {} } }), reg).diagnostics.map((d) => [d.code, d.path])).toEqual([['gantt.tag', '/tags/spare']]);
  });

  it('joins the right ends of the bars for each link type, on the timeline', () => {
    const g = drawn(
      plan([
        { id: 'a', name: 'A', duration: 5 },
        { id: 'fs', name: 'FS', duration: 2, after: ['a'] },
        { id: 'ss', name: 'SS', duration: 2, after: ['a SS+1'] },
        { id: 'ff', name: 'FF', duration: 2, after: ['a FF'] },
        { id: 'sf', name: 'SF', duration: 2, after: ['a SF+4'] },
      ]),
    );
    const a = node(g, 'a');
    const ends = (id: string) => {
      const e = g.edges.find((x) => x.to === id)!;
      const [p, q, b] = [e.points[0]!, e.points.at(-1)!, node(g, id)];
      return [p.x === a.x ? 'start' : p.x === a.x + a.w ? 'finish' : '?', q.x === b.x ? 'start' : q.x === b.x + b.w ? 'finish' : '?'];
    };
    expect(['fs', 'ss', 'ff', 'sf'].map(ends)).toEqual([
      ['finish', 'start'],
      ['start', 'start'],
      ['finish', 'finish'],
      ['start', 'finish'],
    ]);
    // Later work sits further right, a moment's width does not depend on its dates, rows go down in order.
    expect(node(g, 'fs').x).toBeGreaterThan(a.x + a.w - 1);
    expect(g.nodes.map((n) => n.y)).toEqual([...g.nodes.map((n) => n.y)].sort((u, v) => u - v));
  });

  it('draws the table, the two-row axis, shaded days off and a deadline line', () => {
    const g = drawn(plan([{ id: 'a', name: 'A task with a rather long name that will not fit in the column at all, however wide', duration: 3 }], { deadline: '2027-01-08', calendar: { holidays: ['2027-01-05'] } }));
    const cells = g.cells!;
    expect(cells.filter((c) => c.fill === 'header' && c.y === 0).map((c) => c.text).slice(0, 6)).toEqual(['WBS', 'Task', 'Owner', 'Start', 'End', 'Days']);
    const name = cells.find((c) => c.text?.startsWith('A task'))!;
    expect(name.text!.endsWith('…')).toBe(true);
    const shaded = cells.filter((c) => c.fill === 'shade');
    expect(shaded.length).toBeGreaterThanOrEqual(2); // the holiday, and the weekend
    expect(g.rules!.filter((r) => r.kind === 'marker').map((r) => r.label)).toEqual(['Deadline']);
    expect(drawn(plan([{ id: 'a', name: 'A', duration: 3 }], { columns: [] })).cells!.filter((c) => c.text === 'Task')).toHaveLength(0);
  });

  it('picks the axis unit from the length of the work', () => {
    const d = dayOf('2027-01-04')!;
    expect([10, 100, 500, 2000].map((n) => scale(d, d + n).unit)).toEqual(['day', 'week', 'month', 'quarter']);
    const s = scale(d, d + 100);
    expect(s.top[0]!.label).toBe('Dec 2026');
    expect(s.bottom.every((t) => t.to - t.from <= 7)).toBe(true);
  });

  it('never routes a link through a bar, and keeps it orthogonal, over random plans', () => {
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 40; run++) {
      const n = 3 + Math.floor(rnd() * 20);
      const tasks: Item[] = Array.from({ length: n }, (_, i) => {
        const type = (['task', 'task', 'task', 'milestone', 'buffer', 'gate'] as const)[Math.floor(rnd() * 6)]!;
        const after = i && rnd() < 0.8 ? Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => `t${Math.floor(rnd() * i)} ${(['FS', 'SS', 'FF', 'SF'] as const)[Math.floor(rnd() * 4)]}${rnd() < 0.3 ? `+${Math.floor(rnd() * 3)}` : ''}`) : undefined;
        return { id: `t${i}`, name: `Task ${i}`, type, ...(type === 'task' || type === 'buffer' ? { duration: 1 + Math.floor(rnd() * 8) } : {}), ...(after && { after: [...new Set(after)] }) };
      });
      const g = drawn(plan(tasks));
      const q = quality(g);
      expect(q.edgeThroughNode, `run ${run}`).toBe(0);
      for (const e of g.edges) expect(e.points.slice(1).every((p, i) => p.x === e.points[i]!.x || p.y === e.points[i]!.y), `run ${run} ${e.id}`).toBe(true);
    }
  });

  it('reads plans from XML, and round-trips every example', () => {
    for (const ex of reg.type('gantt')!.examples) expect(parseXml(toXml(ex.source), reg).value).toEqual(ex.source);
  });
});
