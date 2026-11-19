import { parseSource, type Diagnostic, type Registry } from '@jtd/core';
import { pretty } from './registry.ts';

/**
 * Bringing files in (URS-WEB-019, URS-WS-005): YAML and XML diagrams are converted to JSON, the editor's
 * language; the workspace keeps them, and exports them as they are.
 */

const FORMATS = { json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml' } as const;

/**
 * Editor text for a file's content. JSON opens as written; YAML and XML are converted to JSON
 * (the editor's language). A file that does not parse is reported, not loaded.
 */
export function toEditorText(name: string, content: string, reg: Registry): { text?: string; converted: boolean; diagnostics: Diagnostic[] } {
  const format = FORMATS[(name.split('.').pop() ?? '').toLowerCase() as keyof typeof FORMATS] ?? 'json';
  if (format === 'json') return { text: content, converted: false, diagnostics: [] };
  const r = parseSource(content, format, reg);
  return r.value === undefined ? { converted: true, diagnostics: r.diagnostics } : { text: pretty(r.value), converted: true, diagnostics: [] };
}

/** `name.ext` → `name.json`. */
export const asJson = (name: string) => `${name.replace(/\.[^.]*$/, '') || 'diagram'}.json`;

/** Files the workspace imports (URS-WS-005). */
export const IMPORTABLE = '.json,.yaml,.yml,.xml,.md,.markdown,.txt,.csv,.tsv,text/*';

/** Ask for files to import; empty when the user cancels. */
export function pickFiles(accept = IMPORTABLE): Promise<File[]> {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept, multiple: true });
  return new Promise((resolve) => {
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}
