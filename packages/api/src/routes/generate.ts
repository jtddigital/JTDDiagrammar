import { AiError, generate, type InputFile } from '@jtd/ai';
import { error } from '@jtd/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AI_STATUS } from '../errors.ts';
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

/** Abort the Claude call when the client goes away, so nobody pays for an abandoned request. */
function abortOnDisconnect(reply: FastifyReply): AbortSignal {
  const ac = new AbortController();
  reply.raw.on('close', () => reply.raw.writableFinished || ac.abort());
  return ac.signal;
}

export const generateRoutes = ({ reg, pool, ai, claude }: Ctx): Route[] => [
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
              files: { type: 'array', items: { type: 'string', format: 'binary' }, description: 'PDF, DOCX, HTML, TXT or MD' },
              text: { type: 'string' },
              type: { type: 'string', description: 'Diagram type id, or "auto" (default)' },
            },
          },
        },
        'application/json': { schema: { type: 'object', properties: { text: { type: 'string' }, type: { type: 'string' } } } },
      },
    },
    responses: {
      200: '{ type, reason?, source, valid, diagnostics, attempts, usage, svg? }. valid is false when repairs ran out.',
      400: 'No usable input or unknown type',
      413: 'Too many or too large files, or too many tokens',
      415: 'Unsupported file type',
      422: 'The AI declined, or its output was cut off',
      502: 'The AI service failed',
      503: 'AI not configured, credentials rejected, or rate limited',
    },
    handler: async (req, reply) => {
      if (!claude) return reply.code(503).send({ diagnostics: [error('ai.disabled', 'AI generation is not configured on this server')] });
      try {
        const input = await readInput(req);
        return await generate(
          { ...input, signal: abortOnDisconnect(reply) },
          {
            registry: reg,
            client: claude,
            render: async (source) => {
              const out = await pool.render(source);
              return out === 'timeout' ? { diagnostics: [error('limit.time', 'rendering took too long')] } : out;
            },
            maxRepairs: ai.maxRepairs,
            maxInputTokens: ai.maxInputTokens,
            limits: { maxFiles: ai.maxFiles, maxFileBytes: ai.maxFileBytes, maxTotalBytes: ai.maxTotalBytes },
          },
        );
      } catch (e) {
        if (e instanceof AiError) return reply.code(AI_STATUS[e.code]).send({ diagnostics: [error(e.code, e.message)] });
        throw e;
      }
    },
  },
];
