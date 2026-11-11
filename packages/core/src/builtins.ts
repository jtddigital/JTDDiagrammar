import { flowchart } from './diagrams/flowchart/index.ts';
import { orgchart } from './diagrams/orgchart/index.ts';
import { state } from './diagrams/state/index.ts';
import { layered } from './layout/layered/index.ts';
import { Registry } from './registry/registry.ts';

/** Registry preloaded with built-in diagram types and layout engines. */
export const createRegistry = (): Registry => new Registry().registerType(flowchart).registerType(state).registerType(orgchart).registerEngine(layered);
