import { AiError, generate, refine, type GenerateOptions, type GenerateResult, type InputFile, type Progress } from '@jtd/ai';
import { error } from '@jtd/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AI_STATUS } from '../errors.ts';
import { RateLimiter } from '../rate-limit.ts';
import type { Ctx, Route } from './route.ts';

/** Multipart (files + fields) or JSON `{ text, type }`. */
async function readInput(req: FastifyRequest): Promise<{ text?: string; type: string; files: InputFile[] }> {
  if (!req.isMultipart()) {
    const body = (req.body ?? {}) as { text?: unknown; type?: unknown };
    return { ...(typeof body.text === 'string' && { text: body.text }), type: typeof body.type === 'string' ? body.type : 'auto', files: [] };
  }
  const files: InputFile[] = [];
  const fields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === 'file') files.push({ name: part.filename, mediaType: part.mimetype, data: await part.toBuffer() });
    else fields[part.fieldname] = String(part.value);
  }
  return { ...(fields.text !== undefined && { text: fields.text }), type: fields.type || 'auto', files };
}

const failure = (e: unknown) =>
  e instanceof AiError ? { status: AI_STATUS[e.code], diagnostics: [error(e.code, e.message)] } : undefined;

/**
 * Run an AI job, answering either as one JSON response or, with `Accept: text/event-stream`, as SSE:
 * `progress` events, then one `result` or `error` event (URS-API-014, URS-AI-015). Closing the
 * connection aborts the Claude call.
 */
async function respond(req: FastifyRequest, reply: FastifyReply, job: (signal: AbortSignal, onProgress?: (p: Progress) => void) => Promise<GenerateResult>) {
  const ac = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || ac.abort());
  if (!(req.headers.accept ?? '').includes('text/event-stream')) {
    try {
      return await job(ac.signal);
    } catch (e) {
      const f = failure(e);
      if (f) return reply.code(f.status).send({ diagnostics: f.diagnostics });
      throw e;
    }
  }
  reply.hijack();
  reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
  const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    send('result', await job(ac.signal, (p) => send('progress', p)));
  } catch (e) {
    send('error', failure(e) ?? { status: 500, diagnostics: [error('internal', 'internal error')] });
  }
  reply.raw.end();
}

export const generateRoutes = ({ reg, pool, ai, claude }: Ctx): Route[] => {
  const limiter = new RateLimiter(ai.ratePerMinute, 60_000);
  const options = (): GenerateOptions => ({
    registry: reg,
    client: claude!,
    render: async (source) => {
      const out = await pool.render(source);
      return out === 'timeout' ? { diagnostics: [error('limit.time', 'rendering took too long')] } : out;
    },
    maxRepairs: ai.maxRepairs,
    maxInputTokens: ai.maxInputTokens,
    limits: { maxFiles: ai.maxFiles, maxFileBytes: ai.maxFileBytes, maxTotalBytes: ai.maxTotalBytes, maxPdfPages: ai.maxPdfPages },
    ...(ai.prices && { prices: ai.prices }),
  });
  /** 503 without credentials, 429 over the per-client rate; undefined when the request may proceed. */
  const gate = (req: FastifyRequest, reply: FastifyReply) => {
    if (!claude) return reply.code(503).send({ diagnostics: [error('ai.disabled', 'AI generation is not configured on this server')] });
    const r = limiter.take(req.ip);
    if (!r.ok) return reply.code(429).header('retry-after', String(r.retryAfterS)).send({ diagnostics: [error('limit.rate', `too many AI requests; retry in ${r.retryAfterS} s`)] });
    return undefined;
  };
  const common = {
    200: '{ type, reason?, source, valid, diagnostics, attempts, usage: { input, output, cacheRead, cacheWrite, costUsd? }, svg? }. valid is false when repairs ran out. With `Accept: text/event-stream`: `progress` events, then `result` or `error`.',
    400: 'No usable input, unknown type, or (refine) a structurally invalid source',
    413: 'Too many or too large files, too many pages or tokens',
    422: 'The AI declined, or its output was cut off',
    429: 'Too many AI requests from this client (Retry-After)',
    502: 'The AI service failed',
    503: 'AI not configured, credentials rejected, or rate limited upstream',
  };

  return [
    {
      method: 'GET',
      url: '/v1/ai',
      summary: 'Whether AI generation is available on this server (URS-API-016).',
      responses: { 200: '{ enabled, model? }' },
      handler: async () => ({ enabled: Boolean(claude), ...(claude && { model: ai.model }) }),
    },
    {
      method: 'POST',
      url: '/v1/generate',
      summary: 'Generate diagram source from documents and/or text with Claude (URS-API-012). The result is validated, and repaired when possible.',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                files: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'PDF, DOCX, HTML, TXT, MD or images (PNG, JPEG, GIF, WebP)' },
                text: { type: 'string' },
                type: { type: 'string', description: 'Diagram type id, or "auto" (default)' },
              },
            },
          },
          'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, type: { type: 'string' } } } },
        },
      },
      responses: { ...common, 415: 'Unsupported file type' },
      handler: async (req, reply) => {
        if (gate(req, reply)) return reply;
        const input = await readInput(req);
        return respond(req, reply, (signal, onProgress) => generate({ ...input, signal, ...(onProgress && { onProgress }) }, options()));
      },
    },
    {
      method: 'POST',
      url: '/v1/refine',
      summary: 'Change an existing diagram from a plain-language instruction (URS-API-013). Styles, hints and notes are kept.',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['source', 'instruction'], properties: { source: { $ref: '#/components/schemas/Diagram' }, instruction: { type: 'string' } } } } } },
      responses: common,
      handler: async (req, reply) => {
        if (gate(req, reply)) return reply;
        const { source, instruction } = (req.body ?? {}) as { source?: unknown; instruction?: unknown };
        return respond(req, reply, (signal, onProgress) => refine({ source, instruction: typeof instruction === 'string' ? instruction : '', signal, ...(onProgress && { onProgress }) }, options()));
      },
    },
  ];
};
