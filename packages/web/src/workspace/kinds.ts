import { parseSource, type Registry, type SourceFormat } from '@jtd/core';

/** What a file is, which decides what Source edits and Preview shows (URS-WS-010). */
export type Kind = 'diagram' | 'markdown' | 'csv' | 'text';

const DIAGRAM: Record<string, SourceFormat> = { json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml' };
export const extension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/**
 * A file's kind from its name, and for `.json`, `.yaml`, `.yml` and `.xml` its content: a diagram when it parses
 * and names a registered `type` (for JSON that no longer parses, a `"type"` it still contains), else text. Never looks at which type it is (URS-WEB-010).
 */
export function kindOf(name: string, text: string, reg: Registry): { kind: Kind; format?: SourceFormat } {
  const ext = extension(name);
  if (ext === 'md' || ext === 'markdown') return { kind: 'markdown' };
  if (ext === 'csv' || ext === 'tsv') return { kind: 'csv' };
  const format = DIAGRAM[ext];
  if (format) {
    const parsed = parseSource(text, format, reg).value as { type?: unknown } | undefined;
    // A diagram saved half-edited stays a diagram: its `"type"` is still there.
    const type = parsed ? parsed.type : format === 'json' ? /"type"\s*:\s*"([^"]+)"/.exec(text)?.[1] : undefined;
    if (typeof type === 'string' && reg.type(type)) return { kind: 'diagram', format };
  }
  return { kind: 'text' };
}

/** Starting content of a new file of each kind (diagrams start from an example). */
export const STARTERS: Record<Exclude<Kind, 'diagram'>, { name: string; text: string }> = {
  markdown: { name: 'Untitled.md', text: '# Untitled\n' },
  csv: { name: 'Untitled.csv', text: 'Name,Value\n' },
  text: { name: 'Untitled.txt', text: '' },
};
