/** The time axis (URS-LY-015): a unit picked from the length of the work, and two header rows. */

export type Unit = 'day' | 'week' | 'month' | 'quarter';
export interface Tick {
  from: number;
  to: number;
  label: string;
}
export interface Scale {
  unit: Unit;
  /** First and last-plus-one day drawn. */
  from: number;
  to: number;
  pxPerDay: number;
  top: Tick[];
  bottom: Tick[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = (day: number) => {
  const d = new Date(day * 86_400_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const dayOfYmd = (y: number, m: number, d = 1) => Date.UTC(y, m, d) / 86_400_000;
/** Monday on or before `day`. */
const monday = (day: number) => day - ((((day + 4) % 7) + 6) % 7);
const monthStart = (day: number) => {
  const { y, m } = ymd(day);
  return dayOfYmd(y, m);
};
const nextMonth = (day: number) => {
  const { y, m } = ymd(day);
  return dayOfYmd(y, m + 1);
};
const quarterStart = (day: number) => {
  const { y, m } = ymd(day);
  return dayOfYmd(y, m - (m % 3));
};
const yearStart = (day: number) => dayOfYmd(ymd(day).y, 0);

/** Pixels per day for each unit, and the longest span (days) each suits. */
const UNITS: { unit: Unit; px: number; upTo: number }[] = [
  { unit: 'day', px: 24, upTo: 45 },
  { unit: 'week', px: 6, upTo: 200 },
  { unit: 'month', px: 1.8, upTo: 1100 },
  { unit: 'quarter', px: 0.75, upTo: Infinity },
];

/** Ticks of `step` (from a start) covering [from, to), clipped to it. */
function ticks(from: number, to: number, first: (d: number) => number, next: (d: number) => number, label: (d: number) => string): Tick[] {
  const out: Tick[] = [];
  for (let d = first(from); d < to; d = next(d)) out.push({ from: Math.max(d, from), to: Math.min(next(d), to), label: label(d) });
  return out;
}

/** Room (px) before the first and after the last day, so lines leaving a bar's end stay on the chart. */
const MARGIN = 28;

export function scale(first: number, last: number): Scale {
  const span = Math.max(1, last - first);
  const { unit, px } = UNITS.find((u) => span <= u.upTo)!;
  const pad = Math.ceil(MARGIN / px);
  const [start, end] = [first - pad, last + pad];
  const month = (d: number) => `${MONTHS[ymd(d).m]} ${ymd(d).y}`;
  const year = (d: number) => `${ymd(d).y}`;
  switch (unit) {
    case 'day': {
      const [from, to] = [start, end];
      return { unit, from, to, pxPerDay: px, top: ticks(from, to, monthStart, nextMonth, month), bottom: ticks(from, to, (d) => d, (d) => d + 1, (d) => `${ymd(d).d}`) };
    }
    case 'week': {
      const [from, to] = [monday(start), monday(end - 1) + 7];
      return { unit, from, to, pxPerDay: px, top: ticks(from, to, monthStart, nextMonth, month), bottom: ticks(from, to, monday, (d) => d + 7, (d) => `${ymd(d).d}`) };
    }
    case 'month': {
      const [from, to] = [monthStart(start), nextMonth(end - 1)];
      return { unit, from, to, pxPerDay: px, top: ticks(from, to, yearStart, (d) => dayOfYmd(ymd(d).y + 1, 0), year), bottom: ticks(from, to, monthStart, nextMonth, (d) => MONTHS[ymd(d).m]!) };
    }
    case 'quarter': {
      const [from, to] = [quarterStart(start), dayOfYmd(ymd(quarterStart(end - 1)).y, ymd(quarterStart(end - 1)).m + 3)];
      const q = (d: number) => `Q${Math.floor(ymd(d).m / 3) + 1}`;
      return { unit, from, to, pxPerDay: px, top: ticks(from, to, yearStart, (d) => dayOfYmd(ymd(d).y + 1, 0), year), bottom: ticks(from, to, quarterStart, (d) => dayOfYmd(ymd(d).y, ymd(d).m + 3), q) };
    }
  }
}
