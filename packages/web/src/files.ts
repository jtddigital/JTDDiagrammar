import { parseSource, type Diagnostic, type Registry } from '@jtd/core';
import { pretty } from './registry.ts';

/**
 * Open and save diagram files (URS-WEB-019). Where the browser has the File System Access API,
 * Save writes back to the opened file; elsewhere Open uses a file input and Save downloads.
 */
export interface DiagramFile {
  name: string;
  /** For saving in place; only for JSON files, since the editor holds JSON. */
  handle?: FileSystemFileHandle;
}

const FORMATS = { json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml' } as const;
export const ACCEPT = '.json,.yaml,.yml,.xml';

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

type Picker = Window & {
  showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle>;
};
const types = [{ description: 'JTDDiagrammar source', accept: { 'application/json': ['.json'], 'application/yaml': ['.yaml', '.yml'], 'application/xml': ['.xml'] } }];
const aborted = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Ask for a file; undefined when the user cancels. */
export async function openFile(): Promise<{ file: DiagramFile; content: string } | undefined> {
  const w = window as Picker;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types, multiple: false });
      const f = await handle!.getFile();
      return { file: { name: f.name, ...(f.name.toLowerCase().endsWith('.json') && { handle: handle! }) }, content: await f.text() };
    } catch (e) {
      if (aborted(e)) return undefined;
      throw e;
    }
  }
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: ACCEPT });
  const f = await new Promise<File | undefined>((resolve) => {
    input.onchange = () => resolve(input.files?.[0]);
    input.oncancel = () => resolve(undefined);
    input.click();
  });
  return f && { file: { name: f.name }, content: await f.text() };
}

/** Save to the file's handle, or ask where (`saveAs`, or no handle yet). Returns the file saved to, or undefined if cancelled. */
export async function saveFile(text: string, file: DiagramFile | undefined, saveAs = false): Promise<DiagramFile | undefined> {
  const w = window as Picker;
  const name = asJson(file?.name ?? 'diagram.json');
  try {
    const handle = !saveAs && file?.handle ? file.handle : w.showSaveFilePicker ? await w.showSaveFilePicker({ suggestedName: name, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] }) : undefined;
    if (!handle) {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
      return { name };
    }
    const out = await handle.createWritable();
    await out.write(text);
    await out.close();
    return { name: handle.name, handle };
  } catch (e) {
    if (aborted(e)) return undefined;
    throw e;
  }
}
