import type { Diagnostic } from '../diagnostics.ts';
import type { GraphIR } from '../ir/types.ts';

export type JsonSchema = Readonly<Record<string, unknown>>;

export interface Example {
  name: string;
  title: string;
  description?: string;
  source: unknown;
}

/** A diagram type plugin (URS-EXT-001). AI assets (URS-EXT-009) are added in P4. */
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
}
