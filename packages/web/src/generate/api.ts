import type { Diagnostic } from '@jtd/core';

export interface Generated {
  type: string;
  reason?: string;
  source: unknown;
  valid: boolean;
  diagnostics: Diagnostic[];
  attempts: number;
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

/** POST /v1/generate as multipart. The API key stays on the server (URS-AI-010). */
export async function generateDiagram(input: { text: string; files: readonly File[]; type: string }, signal: AbortSignal): Promise<Generated> {
  const form = new FormData();
  form.append('type', input.type);
  if (input.text.trim()) form.append('text', input.text);
  for (const f of input.files) form.append('files', f, f.name);
  const res = await fetch('/v1/generate', { method: 'POST', body: form, signal });
  const body = (await res.json().catch(() => ({}))) as Partial<Generated> & { diagnostics?: Diagnostic[] };
  if (!res.ok) throw new Error(body.diagnostics?.[0]?.message ?? `generation failed (${res.status})`);
  return body as Generated;
}
