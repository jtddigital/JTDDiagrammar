export * from './diagnostics.ts';
export type * from './ir/types.ts';
export type * from './registry/diagram-type.ts';
export type * from './registry/layout-engine.ts';
export { Registry } from './registry/registry.ts';
export { createRegistry } from './diagrams/index.ts';
export { combinedSchema } from './schema/combined.ts';
export { parseJson, type ParseResult } from './adapters/json.ts';
export { compile, type CompileResult } from './compile.ts';
