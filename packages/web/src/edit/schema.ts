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

export type FieldKind = 'text' | 'color' | 'number' | 'choice' | 'yesno' | 'list' | 'ref' | 'refs' | 'group' | 'items' | 'json';

export interface Field {
  name: string;
  kind: FieldKind;
  schema: Schema;
  required: boolean;
  description?: string;
  options?: readonly string[];
  /** For a reference: the collection whose items' ids it takes (URS-WEB-027). */
  ref?: string;
}

/** The collection a reference points into, from the schema's `$comment: "ref:<collection>"`. */
export const refOf = (s: Schema | undefined): string | undefined => (typeof s?.$comment === 'string' ? /^ref:([\w,]+(?:#\w+)?)$/.exec(s.$comment)?.[1] : undefined);

const typeOf = (s: Schema) => (Array.isArray(s.type) ? (s.type as string[]).find((t) => t !== 'null') : (s.type as string | undefined));

/** What kind of field edits a value of this schema. */
export function kindOf(root: Schema, s: Schema): Pick<Field, 'kind' | 'options' | 'ref'> {
  const to = refOf(s);
  if (to) return { kind: 'ref', ref: to };
  const many = typeOf(s) === 'array' ? refOf(resolve(root, obj(s.items))) : undefined;
  if (many) return { kind: 'refs', ref: many };
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

/**
 * The values a reference may take (`collection[,collection…][#key]`): the key (default `id`) of every item in an
 * array of one of those names, at any depth, with its label.
 */
export function targets(doc: unknown, spec: string): { id: string; label?: string }[] {
  const [names = '', key = 'id'] = spec.split('#');
  const collections = new Set(names.split(','));
  const out: { id: string; label?: string }[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (collections.has(k) && Array.isArray(x))
        for (const item of x) {
          const o = item as Record<string, unknown> | null;
          const id = o && typeof o === 'object' ? o[key] : undefined;
          if (typeof id === 'string' && !seen.has(id)) {
            seen.add(id);
            const label = typeof o!.label === 'string' ? o!.label : typeof o!.name === 'string' ? o!.name : undefined;
            out.push({ id, ...(label && label !== id && { label }) });
          }
        }
      walk(x);
    }
  };
  walk(doc);
  return out;
}

/**
 * Why a value does not fit its schema, or undefined when it does (URS-WEB-025): type, choices, pattern, bounds,
 * lengths, and the same for list items. The rest is left to the diagram's own checks.
 */
export function problem(root: Schema, s: Schema, v: unknown): string | undefined {
  if (v === undefined) return undefined;
  const alts = branches(root, s);
  if (alts.length > 1) return alts.some((a) => !problem(root, a, v)) ? undefined : 'Not one of the allowed forms.';
  const t = typeOf(s);
  const is = (x: string) => (x === 'integer' ? Number.isInteger(v) : x === 'number' ? typeof v === 'number' && Number.isFinite(v) : x === 'array' ? Array.isArray(v) : x === 'object' ? !!v && typeof v === 'object' && !Array.isArray(v) : typeof v === x);
  if (t && !is(t)) return t === 'integer' ? 'Must be a whole number.' : t === 'number' ? 'Must be a number.' : `Must be ${t === 'array' ? 'a list' : `a ${t}`}.`;
  if (Array.isArray(s.enum) && !(s.enum as unknown[]).includes(v)) return `Must be one of: ${(s.enum as unknown[]).join(', ')}.`;
  if (s.const !== undefined && s.const !== v) return `Must be ${String(s.const)}.`;
  if (typeof v === 'string') {
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(v)) return refOf(s) || /\bid\b/i.test(String(s.description)) ? 'Not a valid id: a letter or _, then letters, digits, _, . or -.' : s.pattern.includes('#') ? 'Must be a hex colour, like #1d4ed8.' : 'Not in the expected form.';
    if (typeof s.minLength === 'number' && v.length < s.minLength) return s.minLength === 1 ? 'Must not be empty.' : `At least ${s.minLength} characters.`;
    if (typeof s.maxLength === 'number' && v.length > s.maxLength) return `At most ${s.maxLength} characters.`;
  }
  if (typeof v === 'number') {
    if (typeof s.minimum === 'number' && v < s.minimum) return `At least ${s.minimum}.`;
    if (typeof s.maximum === 'number' && v > s.maximum) return `At most ${s.maximum}.`;
    if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum) return `More than ${s.exclusiveMinimum}.`;
  }
  if (Array.isArray(v)) {
    if (typeof s.minItems === 'number' && v.length < s.minItems) return `At least ${s.minItems} item${s.minItems === 1 ? '' : 's'}.`;
    const items = resolve(root, obj(s.items));
    if (items)
      for (const [i, x] of v.entries()) {
        const p = problem(root, items, x);
        if (p) return `Item ${i + 1} (${JSON.stringify(x)}): ${p}`;
      }
  }
  return undefined;
}
