import type { Box } from '../geometry.ts';

const CELL = 96;
/** Cell coordinates packed into one number (layouts stay well within ±2^20 cells). */
const key = (x: number, y: number) => x * 2 ** 21 + y;

/** Uniform-grid spatial index: candidates whose boxes share a cell with the query. */
export class Grid<T> {
  readonly #cells = new Map<number, T[]>();

  #each(b: Box, f: (k: number) => void): void {
    for (let x = Math.floor(b.x / CELL); x <= Math.floor((b.x + b.w) / CELL); x++)
      for (let y = Math.floor(b.y / CELL); y <= Math.floor((b.y + b.h) / CELL); y++) f(key(x, y));
  }

  add(b: Box, item: T): void {
    this.#each(b, (k) => {
      const cell = this.#cells.get(k);
      if (cell) cell.push(item);
      else this.#cells.set(k, [item]);
    });
  }

  /** Whether any candidate near `b` passes `f`; allocation-free. */
  some(b: Box, f: (t: T) => boolean): boolean {
    for (let x = Math.floor(b.x / CELL); x <= Math.floor((b.x + b.w) / CELL); x++)
      for (let y = Math.floor(b.y / CELL); y <= Math.floor((b.y + b.h) / CELL); y++) if (this.#cells.get(key(x, y))?.some(f)) return true;
    return false;
  }

  near(b: Box): Set<T> {
    const out = new Set<T>();
    this.#each(b, (k) => this.#cells.get(k)?.forEach((t) => out.add(t)));
    return out;
  }
}
