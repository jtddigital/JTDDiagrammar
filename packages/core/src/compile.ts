import { hasErrors, type Diagnostic } from './diagnostics.ts';
import type { GraphIR } from './ir/types.ts';
import type { DiagramType } from './registry/diagram-type.ts';
import type { Registry } from './registry/registry.ts';
import { validateIR } from './validate/common.ts';
import { checkEnvelope } from './validate/envelope.ts';
import { validateSchema } from './validate/schema.ts';

export interface CompileResult {
  type?: DiagramType;
  ir?: GraphIR;
  diagnostics: Diagnostic[];
}

/**
 * envelope → type schema → type rules + IR + common rules.
 * Semantic rules only run once the schema passes, since structure is untrusted before that.
 */
export function compile(doc: unknown, reg: Registry): CompileResult {
  const env = checkEnvelope(doc, reg);
  const type = env.type;
  if (!type) return { diagnostics: env.diagnostics };

  const schemaErrors = validateSchema(type.schema, doc);
  if (schemaErrors.length) return { type, diagnostics: schemaErrors };

  const ir = type.toIR(doc);
  const diagnostics = [...(type.validate?.(doc) ?? []), ...validateIR(ir)];
  return hasErrors(diagnostics) ? { type, diagnostics } : { type, ir, diagnostics };
}
