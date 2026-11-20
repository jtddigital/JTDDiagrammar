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
  /** Type-specific instructions appended to the system prompt. */
  guide: string;
  /** Few-shot pairs: material → generation-schema output. */
  examples: readonly { input: string; output: unknown }[];
}

/** A change to a source document: the value for the JSON Pointer `at`, or, with `append`, added to the array there (made if missing). */
export interface SourceEdit {
  at: string;
  value: unknown;
  append?: boolean;
}

/**
 * Direct editing from the diagram (URS-EXT-012, URS-WEB-026): what the diagram toolbar can add, each made
 * from a fresh id and the current model, and how one drawn node connects to another (by IR node ids).
 */
export interface EditAssets<M = unknown> {
  add: readonly { label: string; make(id: string, model: M): SourceEdit; /** Whether it can be added now; always, when absent. */ available?(model: M): boolean }[];
  connect?(model: M, from: string, to: string): SourceEdit | undefined;
}

/** A text export a type offers besides SVG, e.g. BPMN 2.0 XML (URS-PM-018). */
export interface Exporter<M = unknown> {
  /** Button and menu label, e.g. "BPMN". */
  label: string;
  mediaType: string;
  /** File extension, without the dot. */
  extension: string;
  run(model: M, title?: string): string;
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
  /** Exports by format id, e.g. `bpmn`; run only on sources without errors. */
  exports?: Readonly<Record<string, Exporter<M>>>;
  /** Optional: editing from the diagram toolbar (URS-EXT-012). */
  edit?: EditAssets<M>;
}
