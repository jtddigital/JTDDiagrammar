import { compile, hasErrors } from '@jtd/core';
import type { Ctx, Route } from './route.ts';

export const validateRoutes = ({ reg }: Ctx): Route[] => [
  {
    method: 'POST',
    url: '/v1/validate',
    summary: 'Validate a diagram without rendering it (URS-API-003).',
    body: true,
    responses: { 200: '{ valid, diagnostics }', 400: 'Body is not JSON', 413: 'Too large', 415: 'Not JSON' },
    handler: async (req) => {
      const { diagnostics } = compile(req.body, reg);
      return { valid: !hasErrors(diagnostics), diagnostics };
    },
  },
];
