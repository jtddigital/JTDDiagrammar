import { parseSource, type Diagnostic, type Registry, type SourceFormat } from '@jtd/core';
import type { FastifyInstance } from 'fastify';

/** Non-JSON bodies arrive as raw text tagged with their format, then go through the core adapters. */
export interface RawSource {
  format: SourceFormat;
  text: string;
}

const isRaw = (b: unknown): b is RawSource => typeof b === 'object' && b !== null && 'format' in b && 'text' in b && Object.keys(b).length === 2;

/** Accept XML and YAML bodies alongside JSON, chosen by Content-Type (URS-API-007). */
export function registerSourceParsers(app: FastifyInstance): void {
  const as = (format: SourceFormat) => (_req: unknown, body: string, done: (e: null, v: RawSource) => void) => done(null, { format, text: body });
  app.addContentTypeParser(['application/xml', 'text/xml'], { parseAs: 'string' }, as('xml'));
  app.addContentTypeParser(['application/yaml', 'application/x-yaml', 'text/yaml'], { parseAs: 'string' }, as('yaml'));
}

/** The diagram document from a request body, or the parse diagnostics. */
export function readDoc(body: unknown, reg: Registry): { doc?: unknown; diagnostics: Diagnostic[] } {
  if (!isRaw(body)) return { doc: body, diagnostics: [] };
  const { value, diagnostics } = parseSource(body.text, body.format, reg);
  return value === undefined ? { diagnostics } : { doc: value, diagnostics: [] };
}
