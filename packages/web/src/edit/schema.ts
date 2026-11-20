/**
 * The schema of one place in a source document (URS-WEB-025): follows a JSON Pointer through `properties`,
 * `items`, `$ref` (local), `allOf`, `anyOf` and `oneOf`, so the details pane can offer a field per property
 * the element allows. Type-agnostic: every diagram type's schema works.
 */
export type Schema = Readonly<Record<string, unknown>>;

const obj = (v: unknown): Schema | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Schema) : undefined);

/** A schema with its local `$ref` followed and `allOf` merged. */
export function resolve(root: Schema, s: Schema | undefined, depth = 0): Schema | undefined {
  if (!s || depth > 20) return s;
  const ref = typeof s.$ref === 'string' ? s.$ref : undefined;
  if (ref?.startsWith('#')) {
    let at: unknown = root;
    for (const seg of ref.slice(1).split('/').filter(Boolean)) at = obj(at)?.[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    const { $ref: _, ...rest } = s;
    return resolve(root, { ...obj(at), ...rest }, depth + 1);
  }
  const all = Array.isArray(s.allOf) ? (s.allOf as Schema[]) : undefined;
  if (!all) return s;
  const { allOf: _, ...rest } = s;
  return all.map((a) => resolve(root, a, depth + 1) ?? {}).reduce<Schema>((m, a) => ({ ...m, ...a, properties: { ...obj(m.properties), ...obj(a.properties) } }), rest);
}

/** The alternatives of a schema (`anyOf`, `oneOf`), or the schema itself. */
const branches = (root: Schema, s: Schema): Schema[] => {
  const alts = (Array.isArray(s.anyOf) ? s.anyOf : Array.isArray(s.oneOf) ? s.oneOf : undefined) as Schema[] | undefined;
  return alts ? alts.map((a) => resolve(root, a) ?? {}) : [s];
};

function child(root: Schema, s: Schema, seg: string): Schema | undefined {
  for (const b of branches(root, s)) {
    if (/^\d+$/.test(seg) && (b.items || b.type === 'array')) {
      const items = Array.isArray(b.prefixItems) ? (b.prefixItems as Schema[])[Number(seg)] ?? obj(b.items) : obj(b.items);
      if (items) return resolve(root, items);
    }
    const props = obj(b.properties);
    if (props?.[seg]) return resolve(root, obj(props[seg]));
    for (const [pattern, p] of Object.entries(obj(b.patternProperties) ?? {})) if (new RegExp(pattern).test(seg)) return resolve(root, obj(p));
    if (obj(b.additionalProperties)) return resolve(root, obj(b.additionalProperties));
  }
  return undefined;
}

/** The schema at a JSON Pointer in a document of `root`'s shape. */
export function schemaAt(root: Schema, pointer: string): Schema | undefined {
  let s = resolve(root, root);
  for (const raw of pointer.split('/').slice(1)) {
    if (!s) return undefined;
    s = child(root, s, raw.replace(/~1/g, '/').replace(/~0/g, '~'));
  }
  return s;
}

export type FieldKind = 'text' | 'color' | 'number' | 'choice' | 'yesno' | 'list' | 'group' | 'items' | 'json';

export interface Field {
  name: string;
  kind: FieldKind;
  schema: Schema;
  required: boolean;
  description?: string;
  options?: readonly string[];
}

const typeOf = (s: Schema) => (Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== 'null') : (s.type as string | undefined));

/** What kind of field edits a value of this schema. */
export function kindOf(root: Schema, s: Schema): Pick<Field, 'kind' | 'options'> {
  const alts = branches(root, s);
  if (alts.length > 1) {
    const enums = alts.every((a) => Array.isArray(a.enum) || a.const !== undefined);
    return enums ? { kind: 'choice', options: alts.flatMap((a) => (Array.isArray(a.enum) ? (a.enum as string[]) : [String(a.const)])) } : { kind: 'json' };
  }
  if (Array.isArray(s.enum)) return { kind: 'choice', options: (s.enum as unknown[]).map(String) };
  const t = typeOf(s);
  if (t === 'string') return { kind: typeof s.pattern === 'string' && s.pattern.includes('a-f') && s.pattern.includes('#') ? 'color' : 'text' };
  if (t === 'integer' || t === 'number') return { kind: 'number' };
  if (t === 'boolean') return { kind: 'yesno' };
  if (t === 'array') {
    const items = resolve(root, obj(s.items));
    const it = items && typeOf(items);
    if (items && (it === 'string' || it === 'number' || it === 'integer' || Array.isArray(items.enum))) return { kind: 'list' };
    return { kind: 'items' };
  }
  if (t === 'object' || obj(s.properties)) return { kind: obj(s.properties) ? 'group' : 'json' };
  return { kind: 'json' };
}

/** The fields an object schema offers, in the schema's order. */
export function fields(root: Schema, s: Schema): Field[] {
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  return Object.entries(obj(s.properties) ?? {}).map(([name, raw]) => {
    const schema = resolve(root, obj(raw)) ?? {};
    const k = kindOf(root, schema);
    return { name, schema, required: required.has(name), ...k, ...(typeof schema.description === 'string' && { description: schema.description }) };
  });
}
