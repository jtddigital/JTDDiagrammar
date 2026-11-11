import type { JsonSchema, Registry } from '@jtd/core';

export const REF_BEGIN = '<!-- BEGIN GENERATED: reference (pnpm docs:build) -->';
export const REF_END = '<!-- END GENERATED: reference -->';

const ENVELOPE = new Set(['$schema', 'version', 'type', 'title', 'theme']);

interface Row {
  field: string;
  type: string;
  required: boolean;
  description: string;
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function resolve(s: JsonSchema, root: JsonSchema): { schema: JsonSchema; ref?: string } {
  const ref = s.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) return { schema: ((root.$defs ?? {}) as Record<string, JsonSchema>)[ref.slice(8)]!, ref };
  return { schema: s };
}

function typeOf(s: JsonSchema, root: JsonSchema): string {
  if (s.enum) return (s.enum as unknown[]).map((v) => `\`${String(v)}\``).join(' | ');
  if (s.const !== undefined) return `\`${String(s.const)}\``;
  if (s.type === 'array') {
    const items = resolve(s.items as JsonSchema, root).schema;
    return items.type === 'object' ? 'list of objects' : `list of ${typeOf(items, root)}`;
  }
  return String(s.type ?? 'any');
}

/** Rows for every field, nested fields as `parent[].child` / `parent.child`; recursion is shown once. */
function rows(s: JsonSchema, root: JsonSchema, prefix: string, seen: Map<string, string>, skip: (k: string) => boolean = () => false): Row[] {
  const req = new Set((s.required ?? []) as string[]);
  return Object.entries((s.properties ?? {}) as Record<string, JsonSchema>).flatMap(([k, raw]) => {
    if (skip(k)) return [];
    const p = resolve(raw, root).schema;
    const field = `${prefix}${k}`;
    const row: Row = { field, type: typeOf(p, root), required: req.has(k), description: String(p.description ?? raw.description ?? '') };
    // `style` is documented once, in the Styling section.
    if (p.type === 'object' && p.properties && k !== 'style') return [row, ...rows(p, root, `${field}.`, seen)];
    if (p.type !== 'array') return [row];
    const items = resolve(p.items as JsonSchema, root);
    if (items.schema.type !== 'object') return [row];
    if (items.ref && seen.has(items.ref)) return [{ ...row, description: `${row.description} Same fields as \`${seen.get(items.ref)}[]\`.`.trim() }];
    if (items.ref) seen.set(items.ref, field);
    return [row, ...rows(items.schema, root, `${field}[].`, seen)];
  });
}

const table = (rs: readonly Row[]) =>
  ['| Field | Type | Required | Description |', '|-------|------|----------|-------------|', ...rs.map((r) => `| \`${r.field}\` | ${cell(r.type)} | ${r.required ? 'yes' : ''} | ${cell(r.description)} |`)].join('\n');

/** Language reference generated from the authoring schemas (URS-DOC-006). */
export function referenceSection(reg: Registry): string {
  const types = reg.types();
  const first = types[0]!.schema;
  const envelope = rows(first, first, '', new Map(), (k) => !ENVELOPE.has(k)).map((r) => (r.field === 'type' ? { ...r, type: types.map((t) => `\`${t.id}\``).join(' | ') } : r));
  return [
    'Fields every diagram has:',
    '',
    table(envelope),
    '',
    ...types.flatMap((t) => [`### \`${t.id}\``, '', t.description, '', table(rows(t.schema, t.schema, '', new Map(), (k) => ENVELOPE.has(k))), '']),
  ].join('\n');
}
