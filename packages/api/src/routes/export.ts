import { exportDiagram } from '@jtd/core';
import { statusFor } from '../errors.ts';
import { readDoc } from '../input.ts';
import type { Ctx, Route } from './route.ts';

/** Text exports a type offers besides SVG, e.g. BPMN 2.0 XML (URS-PM-018). */
export const exportRoutes = ({ reg }: Ctx): Route[] => [
  {
    method: 'POST',
    url: '/v1/export/:format',
    summary: 'Export a diagram in another format its type offers, e.g. `bpmn` (BPMN 2.0 XML, one way; URS-PM-018). `GET /v1/types` lists each type’s formats.',
    body: true,
    responses: { 200: 'The export, e.g. application/xml', 400: 'Invalid diagram, or a format its type does not offer: { diagnostics }', 413: 'Too large', 415: 'Not JSON, XML or YAML' },
    handler: async (req, reply) => {
      const { doc, diagnostics } = readDoc(req.body, reg);
      if (doc === undefined) return reply.code(400).send({ diagnostics });
      const out = exportDiagram(doc, (req.params as { format: string }).format, reg);
      if (out.text === undefined) return reply.code(statusFor(out.diagnostics)).send({ diagnostics: out.diagnostics });
      const title = String((doc as { title?: unknown }).title ?? 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram';
      return reply.type(`${out.mediaType}; charset=utf-8`).header('content-disposition', `attachment; filename="${title}.${out.extension}"`).send(out.text);
    },
  },
];
