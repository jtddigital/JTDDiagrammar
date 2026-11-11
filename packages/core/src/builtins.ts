import { flowchart } from './diagrams/flowchart/index.ts';
import { layered } from './layout/layered/index.ts';
import { Registry } from './registry/registry.ts';

/** Registry preloaded with built-in diagram types and layout engines. */
export const createRegistry = (): Registry => new Registry().registerType(flowchart).registerEngine(layered);
