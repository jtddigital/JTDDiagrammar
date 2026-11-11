import type { Diagnostic } from '../diagnostics.ts';
import type { GraphIR } from '../ir/types.ts';

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface Example {
  name: string;
  title: string;
  description?: string;
  source: unknown;
}

/**
 * What a type contributes to AI generation (URS-EXT-009). `schema` uses only the JSON Schema subset
 * that structured outputs support (URS-AI-004); `fromGenerated` maps its output to authoring source,
 * which then goes through full validation.
 */
export interface AiAssets<M = unknown> {
  schema: JsonSchema;
  fromGenerated(generated: unknown): M;
  /** Authoring source → generation shape, for refining an existing diagram (URS-AI-013). */
  toGenerated(model: M): unknown;
  /** Carry fields the generation schema cannot express (styles, hints, notes) from `previous` onto `next`, matched by id. */
  merge(previous: M, next: M): M;
  /** Type-specific instructions appended to the system prompt. */
  guide: string;
  /** Few-shot pairs: material → generation-schema output. */
  examples: readonly { input: string; output: unknown }[];
}

/** A diagram type plugin (URS-EXT-001). */
export interface DiagramType<M = unknown> {
  id: string;
  title: string;
  description: string;
  /** Authoring schema; must carry a unique `$id` (URS-EXT-006). */
  schema: JsonSchema;
  /** Layout engine id (URS-EXT-005). */
  engine: string;
  /** Type-specific semantic rules, run after schema validation (URS-EXT-007). */
  validate?(model: M): Diagnostic[];
  toIR(model: M): GraphIR;
  /** At least one; all are shown in the README (URS-EXT-010, URS-DOC-002). */
  examples: readonly [Example, ...Example[]];
  ai: AiAssets<M>;
}
