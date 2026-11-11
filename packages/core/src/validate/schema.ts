import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { child, error, type Diagnostic } from '../diagnostics.ts';
import type { JsonSchema } from '../registry/diagram-type.ts';

const ajv = new Ajv2020({ allErrors: true, strict: true, discriminator: true });
const compiled = new WeakMap<JsonSchema, ValidateFunction>();

const toDiagnostic = (e: ErrorObject): Diagnostic => {
  const p = e.params as Record<string, unknown>;
  if (e.keyword === 'additionalProperties')
    return error('schema.additionalProperties', `unknown property '${String(p.additionalProperty)}'`, child(e.instancePath, String(p.additionalProperty)));
  const detail = e.keyword === 'enum' ? `: ${(p.allowedValues as unknown[]).join(', ')}` : '';
  return error(`schema.${e.keyword}`, `${e.message ?? 'invalid'}${detail}`, e.instancePath);
};

/** Validate against a JSON Schema, reporting every error (URS-IN-001, URS-IN-004). */
export function validateSchema(schema: JsonSchema, data: unknown): Diagnostic[] {
  let fn = compiled.get(schema);
  if (!fn) compiled.set(schema, (fn = ajv.compile(schema)));
  return fn(data) ? [] : (fn.errors ?? []).map(toDiagnostic);
}
