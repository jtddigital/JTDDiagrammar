import { fixtures } from './fixtures.ts';
import { randomGraphs } from './random.ts';

export const BASELINE_FILE = new URL('./quality-baseline.json', import.meta.url);
export const qualityFixtures = (): [string, unknown][] => [...fixtures(), ...randomGraphs()];
