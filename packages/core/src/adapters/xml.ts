import { XMLParser } from 'fast-xml-parser';
import { error } from '../diagnostics.ts';
import type { JsonSchema } from '../registry/diagram-type.ts';
import type { Registry } from '../registry/registry.ts';
import type { ParseResult } from './json.ts';

/** fast-xml-parser's ordered output: `{ tag: children[], ':@'?: attributes }` or `{ '#text': string }`. */
type XNode = Record<string, unknown> & { ':@'?: Record<string, string> };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  preserveOrder: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true,
});

const tagOf = (n: XNode) => Object.keys(n).find((k) => k !== ':@');
const childrenOf = (n: XNode) => (n[tagOf(n)!] as XNode[]).filter((c) => tagOf(c) !== '#text');
const textOf = (n: XNode) => (n[tagOf(n)!] as XNode[]).map((c) => (c['#text'] as string | undefined) ?? '').join('');

function resolve(s: JsonSchema | undefined, root: JsonSchema): JsonSchema | undefined {
  const ref = s?.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return s;
  return ((root.$defs ?? {}) as Record<string, JsonSchema>)[ref.slice('#/$defs/'.length)];
}

/** Attribute text → JSON scalar of the type the schema asks for; otherwise left as text for validation to report. */
function scalar(v: string, s: JsonSchema | undefined): unknown {
  if (s?.type === 'integer' || s?.type === 'number') return v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  if (s?.type === 'boolean') return v === 'true' ? true : v === 'false' ? false : v;
  return v;
}

/** Element → JSON guided by the schema: attributes are scalars, child elements are objects, arrays or text. */
function convert(n: XNode, s: JsonSchema | undefined, root: JsonSchema): unknown {
  const schema = resolve(s, root);
  if (schema?.type === 'array') return childrenOf(n).map((c) => convert(c, schema.items as JsonSchema, root));
  if (schema?.type === 'string' || schema?.type === 'integer' || schema?.type === 'number') return scalar(textOf(n), schema);
  const props = (schema?.properties ?? {}) as Record<string, JsonSchema>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n[':@'] ?? {})) out[k] = scalar(v, resolve(props[k], root));
  for (const c of childrenOf(n)) out[tagOf(c)!] = convert(c, props[tagOf(c)!], root);
  return out;
}

/**
 * XML source adapter (URS-IN-006): `<diagram version="1" type="…">` with attributes for scalars and
 * child elements for objects (`<style …/>`) and arrays (`<nodes><node …/></nodes>`, any item name).
 * Type-agnostic: the registered type's schema decides scalar types and array/object shape.
 * DOCTYPE is refused, so no entity expansion or external entities.
 */
export function parseXml(text: string, reg: Registry): ParseResult {
  if (/<!DOCTYPE/i.test(text)) return { diagnostics: [error('parse.xml', 'DOCTYPE is not allowed')] };
  let nodes: XNode[];
  try {
    nodes = (parser.parse(text, true) as XNode[]).filter((n) => tagOf(n) !== '?xml' && tagOf(n) !== '#text');
  } catch (e) {
    return { diagnostics: [error('parse.xml', e instanceof Error ? e.message : 'invalid XML')] };
  }
  const root = nodes[0];
  if (nodes.length !== 1 || !root || tagOf(root) !== 'diagram') return { diagnostics: [error('parse.xml', 'expected a single <diagram> root element')] };
  const type = reg.type(root[':@']?.type ?? '');
  return { value: convert(root, type?.schema, type?.schema ?? {}), diagnostics: [] };
}

const SINGULAR: Record<string, string> = { nodes: 'node', edges: 'edge', lanes: 'lane', phases: 'phase', states: 'state', transitions: 'transition' };
const attr = (v: unknown) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

function element(tag: string, v: unknown, indent: string): string {
  if (Array.isArray(v)) {
    const item = SINGULAR[tag] ?? 'item';
    return `${indent}<${tag}>\n${v.map((x) => element(item, x, `${indent}  `)).join('')}${indent}</${tag}>\n`;
  }
  const o = v as Record<string, unknown>;
  const attrs = Object.entries(o).filter(([, x]) => typeof x !== 'object' || x === null);
  const kids = Object.entries(o).filter(([, x]) => typeof x === 'object' && x !== null);
  const head = `${indent}<${tag}${attrs.map(([k, x]) => ` ${k}="${attr(x)}"`).join('')}`;
  return kids.length ? `${head}>\n${kids.map(([k, x]) => element(k, x, `${indent}  `)).join('')}${indent}</${tag}>\n` : `${head}/>\n`;
}

/** JSON diagram → XML in the adapter's format (inverse of parseXml for valid documents). */
export const toXml = (doc: unknown): string => `<?xml version="1.0" encoding="UTF-8"?>\n${element('diagram', doc, '')}`;
