import { describe, expect, it } from 'vitest';
import { calendar } from '../src/diagrams/gantt/calendar.ts';
import { dayOf, isoOf, weekday } from '../src/diagrams/gantt/dates.ts';
import { parseLink, type Gantt, type Item } from '../src/diagrams/gantt/model.ts';
import { scheduleOf } from '../src/diagrams/gantt/schedule.ts';

// 2027-01-04 is a Monday.
const plan = (tasks: Item[], extra: Partial<Gantt> = {}): Gantt => ({ version: '1', type: 'gantt', start: '2027-01-04', tasks, ...extra });
const dates = (g: Gantt) => Object.fromEntries(scheduleOf(g).rows.map((r) => [r.item.id, [r.first, r.last, r.days]]));
const codes = (g: Gantt) => scheduleOf(g).diagnostics.map((d) => [d.severity, d.code, d.path]);

describe('gantt dates and calendar (URS-TYP-016)', () => {
  it('reads real dates only, and knows the weekday', () => {
    expect(isoOf(dayOf('2027-01-04')!)).toBe('2027-01-04');
    expect(dayOf('2027-02-30')).toBeUndefined();
    expect(dayOf('27-1-4')).toBeUndefined();
    expect(weekday(dayOf('2027-01-04')!)).toBe(1);
  });

  it('counts working days, skipping weekends and holidays, either side of the start', () => {
    const start = dayOf('2027-01-04')!;
    const c = calendar(start, undefined, [dayOf('2027-01-06')!]);
    expect([0, 1, 2, 5].map((i) => isoOf(c.dayAt(i)))).toEqual(['2027-01-04', '2027-01-05', '2027-01-07', '2027-01-12']);
    expect(isoOf(c.dayAt(-1))).toBe('2027-01-01');
    expect(c.startIndex(dayOf('2027-01-09')!)).toBe(4); // Saturday → Monday 11th, the 5th working day
    expect(c.finishIndex(dayOf('2027-01-09')!)).toBe(4); // Saturday → after Friday 8th
    expect(c.startIndex(dayOf('2026-12-31')!)).toBe(-2);
  });

  it('reads links: type and lag in days', () => {
    expect(parseLink('a')).toEqual({ task: 'a', type: 'FS', lag: 0 });
    expect(parseLink('a SS+2')).toEqual({ task: 'a', type: 'SS', lag: 2 });
    expect(parseLink('a FF -1d')).toEqual({ task: 'a', type: 'FF', lag: -1 });
    expect(parseLink('a XX')).toBeUndefined();
  });
});

describe('gantt scheduling (URS-TYP-016)', () => {
  it('chains finish-to-start over the weekend', () => {
    const g = plan([
      { id: 'a', name: 'A', duration: 5 },
      { id: 'b', name: 'B', duration: 3, after: ['a'] },
    ]);
    expect(dates(g)).toEqual({ a: ['2027-01-04', '2027-01-08', 5], b: ['2027-01-11', '2027-01-13', 3] });
    expect(codes(g)).toEqual([]);
  });

  it('applies SS, FF and SF links with lags and leads', () => {
    const g = plan([
      { id: 'a', name: 'A', duration: 5 },
      { id: 'ss', name: 'SS', duration: 2, after: ['a SS+2'] },
      { id: 'ff', name: 'FF', duration: 2, after: ['a FF'] },
      { id: 'sf', name: 'SF', duration: 2, after: ['a SF+3'] },
      { id: 'lead', name: 'Lead', duration: 1, after: ['a FS-1'] },
    ]);
    expect(dates(g)).toMatchObject({
      ss: ['2027-01-06', '2027-01-07', 2],
      ff: ['2027-01-07', '2027-01-08', 2],
      sf: ['2027-01-05', '2027-01-06', 2],
      lead: ['2027-01-08', '2027-01-08', 1],
    });
  });

  it('places moments at the end of the day before them, and keeps them out of time', () => {
    const g = plan([
      { id: 'a', name: 'A', duration: 5 },
      { id: 'm', name: 'Done', type: 'milestone', after: ['a'] },
      { id: 'g', name: 'Gate', type: 'gate', after: ['m'], duration: 3 },
      { id: 'fixed', name: 'Launch', type: 'deliverable', end: '2027-02-01' },
    ]);
    expect(dates(g)).toMatchObject({ m: ['2027-01-08', '2027-01-08', 0], g: ['2027-01-08', '2027-01-08', 0], fixed: ['2027-02-01', '2027-02-01', 0] });
    expect(codes(g)).toEqual([['warning', 'gantt.duration', '/tasks/2/duration']]);
  });

  it('keeps fixed dates, warning about each link they break', () => {
    const g = plan([
      { id: 'a', name: 'A', duration: 5 },
      { id: 'b', name: 'B', start: '2027-01-06', duration: 2, after: ['a'] },
      { id: 'c', name: 'C', start: '2027-01-11', end: '2027-01-12' },
      { id: 'early', name: 'Early', start: '2026-12-28', duration: 1 },
    ]);
    expect(dates(g)).toMatchObject({ b: ['2027-01-06', '2027-01-07', 2], c: ['2027-01-11', '2027-01-12', 2], early: ['2026-12-28', '2026-12-28', 1] });
    expect(codes(g).sort()).toEqual([
      ['warning', 'gantt.conflict', '/tasks/1/start'],
      ['warning', 'gantt.early', '/tasks/3/start'],
    ]);
    expect(scheduleOf(g).diagnostics.find((d) => d.code === 'gantt.conflict')!.message).toBe("'b' is fixed to 2027-01-06, before its FS link to 'a' allows (2027-01-11); its dates are kept");
  });

  it('rolls summaries up from their items, at any depth, and links to and from them', () => {
    const g = plan([
      { id: 'p', name: 'Phase', tasks: [
        { id: 'x', name: 'X', duration: 2 },
        { id: 'q', name: 'Sub', tasks: [{ id: 'y', name: 'Y', duration: 3, after: ['x'] }] },
      ] },
      { id: 'next', name: 'Next', duration: 1, after: ['p'] },
      { id: 'later', name: 'Later', tasks: [{ id: 'z', name: 'Z', duration: 1 }], after: ['next'] },
    ]);
    expect(dates(g)).toEqual({
      p: ['2027-01-04', '2027-01-08', 5],
      x: ['2027-01-04', '2027-01-05', 2],
      q: ['2027-01-06', '2027-01-08', 3],
      y: ['2027-01-06', '2027-01-08', 3],
      next: ['2027-01-11', '2027-01-11', 1],
      later: ['2027-01-12', '2027-01-12', 1],
      z: ['2027-01-12', '2027-01-12', 1],
    });
    expect(scheduleOf(g).rows.map((r) => r.wbs)).toEqual(['1', '1.1', '1.2', '1.2.1', '2', '3', '3.1']);
  });

  it('follows the calendar: holidays, and a seven-day week', () => {
    const h = plan([{ id: 'a', name: 'A', duration: 3 }], { calendar: { holidays: ['2027-01-05'] } });
    expect(dates(h).a).toEqual(['2027-01-04', '2027-01-07', 3]);
    const all = plan([{ id: 'a', name: 'A', duration: 7 }], { calendar: { workdays: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] } });
    expect(dates(all).a).toEqual(['2027-01-04', '2027-01-10', 7]);
  });

  it('reports bad links, loops and dates, and still schedules the rest', () => {
    const g = plan([
      { id: 'a', name: 'A', duration: 1, after: ['b'] },
      { id: 'b', name: 'B', duration: 1, after: ['a'] },
      { id: 'c', name: 'C', duration: 1, after: ['nope', 'c'] },
      { id: 'p', name: 'P', duration: 9, tasks: [{ id: 'k', name: 'K', duration: 1, after: ['p'] }] },
      { id: 'd', name: 'D', start: '2027-02-30' },
      { id: 'e', name: 'E', start: '2027-01-08', end: '2027-01-05' },
      { id: 'a', name: 'Again' },
    ], { deadline: '2027-01-05' });
    expect(codes(g)).toEqual(
      expect.arrayContaining([
        ['error', 'gantt.duplicate', '/tasks/6/id'],
        ['error', 'ref.task', '/tasks/2/after/0'],
        ['error', 'gantt.link', '/tasks/2/after/1'],
        ['error', 'gantt.link', '/tasks/3/tasks/0/after/0'],
        ['warning', 'gantt.summary', '/tasks/3'],
        ['error', 'gantt.cycle', '/tasks/0'],
        ['error', 'gantt.date', '/tasks/4/start'],
        ['error', 'gantt.dates', '/tasks/5/end'],
        ['warning', 'gantt.duration', '/tasks/6'],
        ['warning', 'gantt.deadline', '/deadline'],
      ]),
    );
    expect(scheduleOf(g).diagnostics.find((d) => d.code === 'gantt.cycle')!.message).toMatch(/a → b → a|b → a → b/);
    expect(scheduleOf(g).rows).toHaveLength(8);
  });
});
