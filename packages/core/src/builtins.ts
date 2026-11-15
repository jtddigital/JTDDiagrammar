import { flowchart } from './diagrams/flowchart/index.ts';
import { gantt } from './diagrams/gantt/index.ts';
import { lifecycle } from './diagrams/lifecycle/index.ts';
import { orgchart } from './diagrams/orgchart/index.ts';
import { state } from './diagrams/state/index.ts';
import { layered } from './layout/layered/index.ts';
import { timeline } from './layout/timeline/index.ts';
import { tree } from './layout/tree/index.ts';
import { Registry } from './registry/registry.ts';

/** Registry preloaded with built-in diagram types and layout engines. */
export const createRegistry = (): Registry => new Registry().registerType(flowchart).registerType(state).registerType(orgchart).registerType(lifecycle).registerType(gantt).registerEngine(layered).registerEngine(tree).registerEngine(timeline);
