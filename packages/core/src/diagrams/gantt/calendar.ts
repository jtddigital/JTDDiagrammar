import { weekday, WEEKDAYS, type Weekday } from './dates.ts';

/**
 * Working days from the project start (URS-TYP-016). Work is counted on a working-day line: index 0 is the
 * first working day on or after the start; a task occupies [start, finish) on it.
 */
export interface Calendar {
  isWork(day: number): boolean;
  /** Calendar day of working-day `i` (negative before the start). */
  dayAt(i: number): number;
  /** Working-day index a task starting on `day` starts at (a non-working day moves to the next working day). */
  startIndex(day: number): number;
  /** Index just after a task finishing on `day` (a non-working day moves back to the previous working day). */
  finishIndex(day: number): number;
}

export function calendar(start: number, workdays: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'], holidays: readonly number[] = []): Calendar {
  const work = new Set(workdays.map((d) => WEEKDAYS.indexOf(d)));
  const off = new Set(holidays);
  // With no working days at all, every day counts, so scheduling still ends.
  const isWork = (day: number) => work.size === 0 || (work.has(weekday(day)) && !off.has(day));
  const ahead: number[] = [];
  const behind: number[] = [];
  const dayAt = (i: number): number => {
    const list = i >= 0 ? ahead : behind;
    const want = i >= 0 ? i : -i - 1;
    for (let d = list.length ? list.at(-1)! + (i >= 0 ? 1 : -1) : i >= 0 ? start : start - 1; list.length <= want; d += i >= 0 ? 1 : -1) if (isWork(d)) list.push(d);
    return list[want]!;
  };
  // Working days strictly before `day`, counted from the start (negative before it).
  const before = (day: number): number => {
    if (day >= start) {
      let i = 0;
      while (dayAt(i) < day) i++;
      return i;
    }
    let i = -1;
    while (dayAt(i) >= day) i--;
    return i + 1;
  };
  return {
    isWork,
    dayAt,
    startIndex: (day) => before(day),
    finishIndex: (day) => before(day + 1),
  };
}
