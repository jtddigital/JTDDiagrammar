import { compile } from './compile.ts';
import { error, hasErrors, type Diagnostic } from './diagnostics.ts';
import type { Registry } from './registry/registry.ts';

export interface ExportResult {
  /** The exported text, when the source has no errors and its type offers the format. */
  text?: string;
  mediaType?: string;
  extension?: string;
  diagnostics: Diagnostic[];
}

/** Formats a document's type offers besides SVG, e.g. `bpmn` (URS-PM-018). */
export const exportFormats = (doc: unknown, reg: Registry) => {
  const type = reg.type(String((doc as { type?: unknown } | null)?.type ?? ''));
  return Object.entries(type?.exports ?? {}).map(([id, x]) => ({ id, label: x.label, extension: x.extension }));
};

/** Validate, then export in `format`; errors, or a format the type does not offer, give diagnostics only (URS-PM-018). */
export function exportDiagram(doc: unknown, format: string, reg: Registry): ExportResult {
  const { type, diagnostics } = compile(doc, reg);
  if (!type || hasErrors(diagnostics)) return { diagnostics };
  const x = type.exports?.[format];
  if (!x) return { diagnostics: [...diagnostics, error('export.format', `type '${type.id}' cannot export '${format}'${type.exports ? `; it offers ${Object.keys(type.exports).join(', ')}` : ''}`, '')] };
  const title = (doc as { title?: unknown }).title;
  return { text: x.run(doc, typeof title === 'string' ? title : undefined), mediaType: x.mediaType, extension: x.extension, diagnostics };
}
