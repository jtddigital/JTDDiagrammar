/** Dates as whole days since 1970-01-01 (UTC), so date arithmetic is integer arithmetic (URS-TYP-016). */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` → day number; undefined when it is not a real date. */
export function dayOf(iso: string): number | undefined {
  const m = ISO.exec(iso);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t / 86_400_000 : undefined;
}

/** Day number → `YYYY-MM-DD`. */
export const isoOf = (day: number): string => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export const weekday = (day: number): number => (((day + 4) % 7) + 7) % 7;

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
