import type { Box } from '../geometry.ts';

const CELL = 96;

/** Uniform-grid spatial index: candidates whose boxes share a cell with the query. */
export class Grid<T> {
  readonly #cells = new Map<string, T[]>();

  #keys(b: Box): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(b.x / CELL); x <= Math.floor((b.x + b.w) / CELL); x++)
      for (let y = Math.floor(b.y / CELL); y <= Math.floor((b.y + b.h) / CELL); y++) keys.push(`${x},${y}`);
    return keys;
  }

  add(b: Box, item: T): void {
    for (const k of this.#keys(b)) {
      const cell = this.#cells.get(k);
      if (cell) cell.push(item);
      else this.#cells.set(k, [item]);
    }
  }

  near(b: Box): Set<T> {
    return new Set(this.#keys(b).flatMap((k) => this.#cells.get(k) ?? []));
  }
}
