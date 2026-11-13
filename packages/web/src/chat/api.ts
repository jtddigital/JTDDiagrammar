import type { Diagnostic } from '@jtd/core';

export interface Generated {
  type: string;
  reason?: string;
  source: unknown;
  valid: boolean;
  diagnostics: Diagnostic[];
  attempts: number;
}

export interface Progress {
  stage: 'ingest' | 'select' | 'generate' | 'validate' | 'repair';
  attempt?: number;
}

/** Whether the server can generate (URS-API-016). Any failure counts as unavailable. */
export async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/v1/ai');
    return res.ok && ((await res.json()) as { enabled: boolean }).enabled;
  } catch {
    return false;
  }
}

const fail = (body: { diagnostics?: Diagnostic[] }, status: number) => new Error(body.diagnostics?.[0]?.message ?? `generation failed (${status})`);

/** Read `progress` events, then the `result` or `error` event, from an SSE response (URS-API-014). */
async function events(res: Response, onProgress: (p: Progress) => void): Promise<Generated> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('the connection closed before a result');
    buf += value;
    let end: number;
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as unknown;
      if (event === 'progress') onProgress(data as Progress);
      else if (event === 'result') return data as Generated;
      else if (event === 'error') throw fail(data as { diagnostics?: Diagnostic[] }, (data as { status?: number }).status ?? 500);
    }
  }
}

/** POST an AI job, streaming progress when the server answers with SSE. The API key stays on the server (URS-AI-010). */
async function call(url: string, body: BodyInit, signal: AbortSignal, onProgress: (p: Progress) => void, json = false): Promise<Generated> {
  const headers: Record<string, string> = { accept: 'text/event-stream, application/json' };
  if (json) headers['content-type'] = 'application/json';
  const res = await fetch(url, { method: 'POST', body, signal, headers });
  if (res.ok && res.headers.get('content-type')?.startsWith('text/event-stream')) return events(res, onProgress);
  const out = (await res.json().catch(() => ({}))) as Partial<Generated> & { diagnostics?: Diagnostic[] };
  if (!res.ok) throw fail(out, res.status);
  return out as Generated;
}

/** POST /v1/generate as multipart (URS-WEB-011). */
export function generateDiagram(input: { text: string; files: readonly File[]; type: string }, signal: AbortSignal, onProgress: (p: Progress) => void = () => {}) {
  const form = new FormData();
  form.append('type', input.type);
  if (input.text.trim()) form.append('text', input.text);
  for (const f of input.files) form.append('files', f, f.name);
  return call('/v1/generate', form, signal, onProgress);
}

/** POST /v1/refine with the current source (URS-WEB-013). */
export const refineDiagram = (source: unknown, instruction: string, signal: AbortSignal, onProgress: (p: Progress) => void = () => {}) =>
  call('/v1/refine', JSON.stringify({ source, instruction }), signal, onProgress, true);
