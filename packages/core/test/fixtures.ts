import { readdirSync, readFileSync } from 'node:fs';
import { createRegistry } from '../src/index.ts';

const dir = new URL('./golden/', import.meta.url);

/** Inputs whose SVG is pinned in ./golden. Examples are pinned by the README check instead. */
export const goldenFixtures = (): [string, unknown][] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f): [string, unknown] => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]);

/** Golden inputs plus every registered example: the layout/render invariant set. */
export const fixtures = (): [string, unknown][] => [
  ...goldenFixtures(),
  ...createRegistry()
    .types()
    .flatMap((t) => t.examples.map((ex): [string, unknown] => [`${t.id}-${ex.name}`, ex.source])),
];
