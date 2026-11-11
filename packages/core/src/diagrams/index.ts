import { Registry } from '../registry/registry.ts';
import { flowchart } from './flowchart/index.ts';

/** Registry preloaded with the built-in diagram types. */
export const createRegistry = (): Registry => new Registry().registerType(flowchart);
