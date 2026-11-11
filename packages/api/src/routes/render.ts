import { error } from '@jtd/core';
import { statusFor } from '../errors.ts';
import type { FastifyReply } from 'fastify';
import { readDoc } from '../input.ts';
import type { Ctx, Route } from './route.ts';

/** A standalone SVG opened directly must not be able to run anything. */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'";

/** `src` is base64url-encoded JSON (URS-API-010). */
function decodeSrc(src: unknown): unknown {
  try {
    return JSON.parse(Buffer.from(String(src ?? ''), 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

const wantsJson = (accept = '') => accept.includes('application/json') && !accept.includes('image/svg+xml');

export const renderRoutes = ({ pool, reg }: Ctx): Route[] => {
  const respond = async (body: unknown, accept: string | undefined, reply: FastifyReply) => {
    const { doc, diagnostics } = readDoc(body, reg);
    if (doc === undefined) return reply.code(400).send({ diagnostics });
    const out = await pool.render(doc);
    if (out === 'timeout') return reply.code(422).send({ diagnostics: [error('limit.time', 'rendering took too long')] });
    if (!out.svg) return reply.code(statusFor(out.diagnostics)).send({ diagnostics: out.diagnostics });
    if (wantsJson(accept)) return { svg: out.svg, diagnostics: out.diagnostics };
    return reply
      .type('image/svg+xml; charset=utf-8')
      .header('content-security-policy', SVG_CSP)
      .header('jtd-warnings', String(out.diagnostics.length))
      .send(out.svg);
  };
  return [
  {
    method: 'POST',
    url: '/v1/render',
    summary: 'Render a diagram to SVG (URS-API-002). Body as JSON, XML or YAML by Content-Type. Send `Accept: application/json` for `{ svg, diagnostics }`.',
    body: true,
    responses: { 200: 'SVG (image/svg+xml), or { svg, diagnostics } as JSON', 400: 'Invalid diagram: { diagnostics }', 413: 'Too large: { diagnostics }', 415: 'Not JSON, XML or YAML', 422: 'Render timed out: { diagnostics }' },
    handler: (req, reply) => respond(req.body, req.headers.accept, reply),
  },
  {
    method: 'GET',
    url: '/v1/render',
    summary: 'Render a diagram given as base64url-encoded JSON in `src`, for `<img src>` embedding (URS-API-010).',
    responses: { 200: 'SVG (image/svg+xml)', 400: 'Invalid or undecodable diagram: { diagnostics }', 413: 'Too large', 422: 'Render timed out' },
    handler: async (req, reply) => {
      const doc = decodeSrc((req.query as { src?: unknown }).src);
      if (doc === undefined) return reply.code(400).send({ diagnostics: [error('parse.src', "'src' must be base64url-encoded JSON")] });
      return respond(doc, req.headers.accept, reply);
    },
  },
  ];
};
