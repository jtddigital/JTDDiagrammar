import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import type { JsonSchema } from '../src/index.ts';
import { compile, createRegistry } from '../src/index.ts';
import { validateSchema } from '../src/validate/schema.ts';
import { checklist } from './fixture-type.ts';

const reg = createRegistry().registerType(checklist);

/** Keywords structured outputs accept (URS-AI-004). Anything else, including `pattern` and `$ref`, is refused here. */
const ALLOWED = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', 'allOf', 'description', 'title', 'format']);

function subsetProblems(s: JsonSchema, path = '#'): string[] {
  const out = Object.keys(s).filter((k) => !ALLOWED.has(k)).map((k) => `${path}: '${k}' not allowed`);
  if (s.type === 'object' && s.additionalProperties !== false) out.push(`${path}: objects need additionalProperties: false`);
  const props = (s.properties ?? {}) as Record<string, JsonSchema>;
  for (const [k, v] of Object.entries(props)) out.push(...subsetProblems(v, `${path}/properties/${k}`));
  if (s.items) out.push(...subsetProblems(s.items as JsonSchema, `${path}/items`));
  for (const k of ['anyOf', 'allOf'] as const) ((s[k] ?? []) as JsonSchema[]).forEach((v, i) => out.push(...subsetProblems(v, `${path}/${k}/${i}`)));
  return out;
}

/**
 * Structured-output limits (URS-AI-004): the API rejects a request (HTTP 400) whose schema has more
 * than 24 optional properties or more than 16 parameters with union types (`anyOf` or a type array).
 */
const OPTIONAL_MAX = 24;
const UNION_MAX = 16;
/**
 * Well under the hard limit: each optional property roughly doubles part of the compiled grammar, and
 * the API also refuses schemas whose grammar is too large ("Schema is too complex for compilation").
 */
const OPTIONAL_TARGET = 8;
function complexity(s: JsonSchema): { optional: number; unions: number } {
  const req = new Set((s.required ?? []) as string[]);
  const kids = [
    ...Object.entries((s.properties ?? {}) as Record<string, JsonSchema>).map(([k, v]) => ({ v, optional: !req.has(k) })),
    ...(s.items ? [{ v: s.items as JsonSchema, optional: false }] : []),
    ...((s.anyOf ?? []) as JsonSchema[]).map((v) => ({ v, optional: false })),
  ];
  return kids.reduce(
    (acc, { v, optional }) => {
      const c = complexity(v);
      return { optional: acc.optional + c.optional + Number(optional), unions: acc.unions + c.unions + Number(!!v.anyOf || Array.isArray(v.type)) };
    },
    { optional: 0, unions: 0 },
  );
}

/** Random instance of a subset schema (deterministic seed). */
function sample(s: JsonSchema, rnd: () => number): unknown {
  if (s.enum) return (s.enum as unknown[])[Math.floor(rnd() * (s.enum as unknown[]).length)];
  switch (s.type) {
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, JsonSchema>;
      const req = new Set((s.required ?? []) as string[]);
      return Object.fromEntries(Object.entries(props).filter(([k]) => req.has(k) || rnd() < 0.5).map(([k, v]) => [k, sample(v, rnd)]));
    }
    case 'array':
      return Array.from({ length: Math.floor(rnd() * 4) }, () => sample(s.items as JsonSchema, rnd));
    case 'string':
      return ['a', 'Step 1', 'x-y', '', 'Ü'][Math.floor(rnd() * 5)];
    case 'integer':
      return Math.floor(rnd() * 10) - 5;
    case 'boolean':
      return rnd() < 0.5;
    default:
      throw new Error(`sample: unsupported ${String(s.type)}`);
  }
}

describe.each(reg.types().map((t) => [t.id, t] as const))('AI assets: %s (URS-EXT-009, URS-AI-004)', (_id, t) => {
  it('generation schema uses only the structured-outputs subset, within its limits', () => {
    expect(subsetProblems(t.ai.schema)).toEqual([]);
    const c = complexity(t.ai.schema);
    expect(c.optional, 'optional properties').toBeLessThanOrEqual(Math.min(OPTIONAL_MAX, OPTIONAL_TARGET));
    expect(c.unions, 'union-typed parameters').toBeLessThanOrEqual(UNION_MAX);
    expect(() => new Ajv2020({ strict: true }).compile(t.ai.schema)).not.toThrow();
  });

  it('few-shot outputs match the generation schema and convert to valid source', () => {
    for (const ex of t.ai.examples) {
      expect(validateSchema(t.ai.schema, ex.output)).toEqual([]);
      expect(compile(t.ai.fromGenerated(ex.output), reg).diagnostics).toEqual([]);
    }
  });

  it('authoring schema is self-contained, so refine can send it whole (URS-AI-013)', () => {
    const refs = JSON.stringify(t.schema).match(/"\$ref":"[^"]*"/g) ?? [];
    expect(refs.filter((r) => !r.startsWith('"$ref":"#'))).toEqual([]);
  });

  it('any schema-valid output converts to authoring-valid shape, except string formats', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const g = sample(t.ai.schema, rnd);
      expect(validateSchema(t.ai.schema, g)).toEqual([]);
      const codes = validateSchema(t.schema, t.ai.fromGenerated(g)).map((d) => d.code);
      expect(codes.filter((c) => c !== 'schema.pattern'), JSON.stringify(g)).toEqual([]);
    }
  });
});
