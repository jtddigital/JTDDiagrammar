import { error } from '@jtd/core';
import { statusFor } from '../errors.ts';
import type { Ctx, Route } from './route.ts';

/** A standalone SVG opened directly must not be able to run anything. */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'";

const wantsJson = (accept = '') => accept.includes('application/json') && !accept.includes('image/svg+xml');

export const renderRoutes = ({ pool }: Ctx): Route[] => [
  {
    method: 'POST',
    url: '/v1/render',
    summary: 'Render a diagram to SVG (URS-API-002). Send `Accept: application/json` for `{ svg, diagnostics }`.',
    body: true,
    responses: { 200: 'SVG (image/svg+xml), or { svg, diagnostics } as JSON', 400: 'Invalid diagram: { diagnostics }', 413: 'Too large: { diagnostics }', 415: 'Not JSON', 422: 'Render timed out: { diagnostics }' },
    handler: async (req, reply) => {
      const out = await pool.render(req.body);
      if (out === 'timeout') return reply.code(422).send({ diagnostics: [error('limit.time', 'rendering took too long')] });
      if (!out.svg) return reply.code(statusFor(out.diagnostics)).send({ diagnostics: out.diagnostics });
      if (wantsJson(req.headers.accept)) return { svg: out.svg, diagnostics: out.diagnostics };
      return reply
        .type('image/svg+xml; charset=utf-8')
        .header('content-security-policy', SVG_CSP)
        .header('jtd-warnings', String(out.diagnostics.length))
        .send(out.svg);
    },
  },
];
