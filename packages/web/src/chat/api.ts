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

/** An AI provider the server offers (URS-AI-023). Copilot carries the public Microsoft sign-in settings. */
export type Provider = { id: 'claude'; model: string } | { id: 'copilot'; clientId: string; tenantId: string; scopes: string[]; signIn?: 'browser' | 'device' };

export interface AiInfo {
  enabled: boolean;
  providers: Provider[];
}

/** What the server offers (URS-API-016). Any failure counts as unavailable. */
export async function aiInfo(): Promise<AiInfo> {
  try {
    const res = await fetch('/v1/ai');
    if (!res.ok) return { enabled: false, providers: [] };
    const info = (await res.json()) as Partial<AiInfo> & { model?: string };
    // Servers before URS-AI-023 report only `enabled` and `model`.
    return { enabled: Boolean(info.enabled), providers: info.providers ?? (info.enabled ? [{ id: 'claude', model: info.model ?? '' }] : []) };
  } catch {
    return { enabled: false, providers: [] };
  }
}

/** Which provider to use, and for Copilot the signed-in user's Graph token. */
export interface Via {
  provider?: Provider['id'];
  graphToken?: string;
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
async function call(url: string, body: BodyInit, signal: AbortSignal, onProgress: (p: Progress) => void, json = false, via: Via = {}): Promise<Generated> {
  const headers: Record<string, string> = { accept: 'text/event-stream, application/json' };
  if (json) headers['content-type'] = 'application/json';
  if (via.graphToken) {
    headers['x-graph-token'] = via.graphToken;
    headers['x-time-zone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  const res = await fetch(url, { method: 'POST', body, signal, headers });
  if (res.ok && res.headers.get('content-type')?.startsWith('text/event-stream')) return events(res, onProgress);
  const out = (await res.json().catch(() => ({}))) as Partial<Generated> & { diagnostics?: Diagnostic[] };
  if (!res.ok) throw fail(out, res.status);
  return out as Generated;
}

/** POST /v1/generate as multipart (URS-WEB-011). */
export function generateDiagram(input: { text: string; files: readonly File[]; type: string }, signal: AbortSignal, onProgress: (p: Progress) => void = () => {}, via: Via = {}) {
  const form = new FormData();
  form.append('type', input.type);
  if (via.provider) form.append('provider', via.provider);
  if (input.text.trim()) form.append('text', input.text);
  for (const f of input.files) form.append('files', f, f.name);
  return call('/v1/generate', form, signal, onProgress, false, via);
}

/** POST /v1/refine with the current source (URS-WEB-013). */
export const refineDiagram = (source: unknown, instruction: string, signal: AbortSignal, onProgress: (p: Progress) => void = () => {}, via: Via = {}) =>
  call('/v1/refine', JSON.stringify({ source, instruction, ...(via.provider && { provider: via.provider }) }), signal, onProgress, true, via);
