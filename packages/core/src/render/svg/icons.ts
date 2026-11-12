import type { Icon } from '../../ir/types.ts';
import { num } from '../../num.ts';
import { ICON } from '../../style.ts';

/** A circle as path data (centre, radius). */
const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Pictograms on a 10 × 10 grid, as path data in that grid (URS-DM-025). */
const PATHS: Record<Icon, string> = {
  // A signature scribble on a line.
  signature: 'M0.5 7C2 3 3 3 3.5 6S5.5 7.5 6.5 4.5S8.5 5 9.5 6M0.5 9.5H9.5',
  clock: `${ring(5, 5, 4.5)}M5 2.2V5H7.4`,
  // An hourglass: a scheduled job.
  timer: 'M1.5 0.5H8.5M1.5 9.5H8.5M2.5 0.5C2.5 4 7.5 6 7.5 9.5M7.5 0.5C7.5 4 2.5 6 2.5 9.5',
  // Two people: every participant must complete.
  all: `${ring(3.2, 2.8, 1.7)}${ring(6.8, 2.8, 1.7)}M0.3 9.5C0.3 5.6 6.1 5.6 6.1 9.5M3.9 9.5C3.9 5.6 9.7 5.6 9.7 9.5`,
  // One person: any one participant completes.
  any: `${ring(5, 2.8, 2)}M1.5 9.5C1.5 5.3 8.5 5.3 8.5 9.5`,
  // One person and a stack: a task for each participant.
  each: `${ring(3.3, 2.8, 1.8)}M0.3 9.5C0.3 5.4 6.3 5.4 6.3 9.5M7.5 2.5H9.7M7.5 5H9.7M7.5 7.5H9.7`,
};

/** Path data scaled to `size` and moved to (x, y): every number in the grid path is a coordinate pair or an arc radius. */
function place(d: string, x: number, y: number, size: number): string {
  const k = size / 10;
  // Absolute commands move; relative arc offsets and radii only scale.
  return d.replace(/([MHVCSLa])([^MHVCSLa]*)/g, (_, cmd: string, args: string) => {
    const v = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const out =
      cmd === 'H' ? v.map((n) => n * k + x) : cmd === 'V' ? v.map((n) => n * k + y) : cmd === 'a' ? v.map((n, i) => (i % 7 === 2 || i % 7 === 3 || i % 7 === 4 ? n : n * k)) : v.map((n, i) => n * k + (i % 2 ? y : x));
    return cmd + out.map(num).join(' ');
  });
}

/** An icon with its top-left at (x, y), drawn in `color`. */
export const icon = (name: Icon, x: number, y: number, color: string, size = ICON): string =>
  `<path d="${place(PATHS[name], x, y, size)}" fill="none" stroke="${color}" stroke-width="1"/>`;
