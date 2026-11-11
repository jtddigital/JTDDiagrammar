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
      return { status: 415, diagnostics: [error('request.media-type', 'send the diagram as application/json')] };
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
      return { status: 400, diagnostics: [error('parse.json', 'request body is empty')] };
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
      return { status: 400, diagnostics: [error('parse.json', 'request body is not valid JSON')] };
    default:
      return (e.statusCode ?? 500) < 500
        ? { status: e.statusCode!, diagnostics: [error('request.invalid', e.message)] }
        : { status: 500, diagnostics: [error('internal', 'internal error')] };
  }
}
