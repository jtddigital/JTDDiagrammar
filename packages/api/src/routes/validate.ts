import { compile, hasErrors } from '@jtd/core';
import { readDoc } from '../input.ts';
import type { Ctx, Route } from './route.ts';

export const validateRoutes = ({ reg }: Ctx): Route[] => [
  {
    method: 'POST',
    url: '/v1/validate',
    summary: 'Validate a diagram without rendering it (URS-API-003).',
    body: true,
    responses: { 200: '{ valid, diagnostics }', 400: 'Body is not JSON', 413: 'Too large', 415: 'Not JSON, XML or YAML' },
    handler: async (req) => {
      const { doc, diagnostics: parse } = readDoc(req.body, reg);
      const { diagnostics } = doc === undefined ? { diagnostics: parse } : compile(doc, reg);
      return { valid: !hasErrors(diagnostics), diagnostics };
    },
  },
];
