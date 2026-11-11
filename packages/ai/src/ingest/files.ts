import { convert } from 'html-to-text';
import mammoth from 'mammoth';
import type { InputBlock } from '../client.ts';
import { AiError } from '../errors.ts';

export interface InputFile {
  name: string;
  mediaType?: string;
  data: Uint8Array;
}

export interface IngestLimits {
  maxFiles: number;
  maxFileBytes: number;
  /** All files together. The Messages API caps a request at 32 MB with base64 (4/3) included. */
  maxTotalBytes: number;
}

type Kind = 'pdf' | 'docx' | 'html' | 'text';

const BY_EXT: Record<string, Kind> = { pdf: 'pdf', docx: 'docx', html: 'html', htm: 'html', txt: 'text', md: 'text', markdown: 'text' };
const BY_TYPE: Record<string, Kind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/html': 'html',
  'text/plain': 'text',
  'text/markdown': 'text',
};

const kindOf = (f: InputFile): Kind => {
  const k = BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? BY_TYPE[f.mediaType?.split(';')[0]?.trim() ?? ''];
  if (!k) throw new AiError('ai.media-type', `unsupported file '${f.name}': use PDF, DOCX, HTML, TXT or MD`);
  return k;
};

/** Material is data: wrap it, and stop it from closing its own wrapper (URS-AI-011). */
export const wrap = (name: string, text: string): InputBlock => ({
  type: 'text',
  text: `<document name="${name.replace(/["<>&]/g, '_')}">\n${text.replace(/<\/document>/gi, '</document_>')}\n</document>`,
});

async function toText(kind: Exclude<Kind, 'pdf'>, f: InputFile): Promise<string> {
  if (kind === 'text') return new TextDecoder().decode(f.data);
  if (kind === 'html') return convert(new TextDecoder().decode(f.data), { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: true } }, { selector: 'img', format: 'skip' }] });
  try {
    return (await mammoth.extractRawText({ buffer: Buffer.from(f.data) })).value;
  } catch {
    throw new AiError('ai.input', `could not read '${f.name}' as a DOCX file`);
  }
}

/** Files and pasted text → content blocks (URS-AI-001, URS-AI-009). PDFs pass through; the rest become text. */
export async function ingest(files: readonly InputFile[], text: string | undefined, limits: IngestLimits): Promise<InputBlock[]> {
  if (files.length > limits.maxFiles) throw new AiError('limit.files', `${files.length} files; the limit is ${limits.maxFiles}`);
  const total = files.reduce((n, f) => n + f.data.byteLength, 0);
  if (total > limits.maxTotalBytes) throw new AiError('limit.file', `files total ${total} bytes; the limit is ${limits.maxTotalBytes}`);
  const blocks: InputBlock[] = [];
  for (const f of files) {
    if (f.data.byteLength > limits.maxFileBytes) throw new AiError('limit.file', `'${f.name}' is ${f.data.byteLength} bytes; the limit is ${limits.maxFileBytes}`);
    const kind = kindOf(f);
    blocks.push(
      kind === 'pdf'
        ? { type: 'document', title: f.name, source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(f.data).toString('base64') } }
        : wrap(f.name, await toText(kind, f)),
    );
  }
  if (text?.trim()) blocks.push(wrap('pasted text', text));
  if (!blocks.length) throw new AiError('ai.input', 'provide text or at least one file');
  return blocks;
}
