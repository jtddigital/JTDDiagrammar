import { error, type Diagnostic } from '../diagnostics.ts';
import type { DiagramType } from '../registry/diagram-type.ts';
import type { Registry } from '../registry/registry.ts';
import { SUPPORTED_MAJOR } from '../schema/fragments.ts';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Check `version` and `type` before type-specific validation (URS-IN-002, URS-EXT-003). */
export function checkEnvelope(doc: unknown, reg: Registry): { type?: DiagramType; diagnostics: Diagnostic[] } {
  if (!isObject(doc)) return { diagnostics: [error('envelope.object', 'diagram must be a JSON object')] };
  const out: Diagnostic[] = [];
  const known = reg.types().map((t) => t.id).join(', ');

  const { version, type } = doc;
  if (typeof version !== 'string') out.push(error('envelope.version', `'version' is required (supported major: ${SUPPORTED_MAJOR})`, '/version'));
  else if (Number.parseInt(version, 10) !== SUPPORTED_MAJOR)
    out.push(error('envelope.version', `unsupported version '${version}' (supported major: ${SUPPORTED_MAJOR})`, '/version'));

  const t = typeof type === 'string' ? reg.type(type) : undefined;
  if (typeof type !== 'string') out.push(error('envelope.type', `'type' is required (one of: ${known})`, '/type'));
  else if (!t) out.push(error('envelope.type', `unknown type '${type}' (one of: ${known})`, '/type'));

  return out.length || !t ? { diagnostics: out } : { type: t, diagnostics: out };
}
