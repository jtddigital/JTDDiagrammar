import type { AiErrorCode } from '@jtd/ai';
import { error, type Diagnostic } from '@jtd/core';
import type { FastifyError } from 'fastify';

/** HTTP status for a failed render/validate: size limits are 413, everything else 400 (URS-API-005). */
export const statusFor = (ds: readonly Diagnostic[]): number => (ds.some((d) => d.code.startsWith('limit.')) ? 413 : 400);

/** Map Fastify's request errors (body parsing, size, media type) to diagnostics. */
export function requestError(err: unknown): { status: number; diagnostics: Diagnostic[] } {
  const e = (err instanceof Error ? err : new Error(String(err))) as Partial<FastifyError> & Error;
  switch (e.code) {
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return { status: 413, diagnostics: [error('limit.body', 'request body is too large')] };
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
      return { status: 415, diagnostics: [error('request.media-type', 'send application/json, application/xml or application/yaml (multipart/form-data for /v1/generate)')] };
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      return { status: 400, diagnostics: [error('parse.json', 'request body is empty')] };
    case 'FST_REQ_FILE_TOO_LARGE':
      return { status: 413, diagnostics: [error('limit.file', 'an uploaded file is too large')] };
    case 'FST_FILES_LIMIT':
      return { status: 413, diagnostics: [error('limit.files', 'too many files')] };
    case 'FST_INVALID_MULTIPART_CONTENT_TYPE':
      return { status: 415, diagnostics: [error('request.media-type', 'send multipart/form-data or application/json')] };
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
      return { status: 400, diagnostics: [error('parse.json', 'request body is not valid JSON')] };
    default:
      return (e.statusCode ?? 500) < 500
        ? { status: e.statusCode!, diagnostics: [error('request.invalid', e.message)] }
        : { status: 500, diagnostics: [error('internal', 'internal error')] };
  }
}

/** HTTP status for each AI failure (URS-AI-008, URS-AI-009, URS-API-015). */
export const AI_STATUS: Record<AiErrorCode, number> = {
  'ai.input': 400,
  'ai.media-type': 415,
  'limit.files': 413,
  'limit.file': 413,
  'limit.tokens': 413,
  'limit.pages': 413,
  'ai.refusal': 422,
  'ai.truncated': 422,
  'ai.config': 503,
  'ai.rate-limit': 503,
  'ai.upstream': 502,
};
