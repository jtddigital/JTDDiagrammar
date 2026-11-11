import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { JsonSchema, Registry } from '@jtd/core';
import { getLocation, parse } from 'jsonc-parser';

type S = Record<string, unknown>;

/** The schema at a JSON path, following properties, items and local $refs. */
function at(schema: S, path: (string | number)[], root: S): S | undefined {
  let s: S | undefined = schema;
  const deref = (x: S | undefined): S | undefined =>
    typeof x?.$ref === 'string' && x.$ref.startsWith('#/$defs/') ? ((root.$defs as Record<string, S>)[x.$ref.slice(8)]) : x;
  for (const seg of path) {
    s = deref(s);
    s = typeof seg === 'number' ? (s?.items as S | undefined) : ((s?.properties as Record<string, S> | undefined)?.[seg]);
  }
  return deref(s);
}

/**
 * Schema-aware completion (URS-WEB-005): property names at a key position, enum values at a value
 * position. The schema is the registered type named by the document's `type`; the envelope is
 * offered before the type is known. No type-specific code (URS-WEB-010).
 */
export const schemaCompletion = (registry: Registry) => (ctx: CompletionContext): CompletionResult | null => {
  const text = ctx.state.doc.toString();
  const loc = getLocation(text, ctx.pos);
  const word = ctx.matchBefore(/"?[\w$-]*/);
  const doc = parse(text) as { type?: unknown } | undefined;
  const type = registry.type(typeof doc?.type === 'string' ? doc.type : '') ?? registry.types()[0];
  if (!type || !word) return null;
  const root = type.schema as JsonSchema as S;

  if (loc.isAtPropertyKey) {
    const parent = at(root, loc.path.slice(0, -1), root);
    const props = Object.entries((parent?.properties ?? {}) as Record<string, S>);
    if (!props.length) return null;
    return {
      from: word.from,
      options: props.map(([name, p]) => ({ label: `"${name}"`, apply: `"${name}": `, type: 'property', ...(typeof p.description === 'string' && { info: p.description }) })),
    };
  }
  const s = at(root, loc.path, root);
  const values = (s?.enum ?? (s?.const !== undefined ? [s.const] : undefined)) as unknown[] | undefined;
  if (!values) return null;
  return { from: word.from, options: values.map((v) => ({ label: JSON.stringify(v), type: 'enum' })) };
};
