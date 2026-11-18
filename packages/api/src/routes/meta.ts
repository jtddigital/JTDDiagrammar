import { combinedSchema, error } from '@jtd/core';
import { VERSION as version } from '../version.ts';
import type { Ctx, Route } from './route.ts';

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** When this server started: the launcher restarts it if config.env changed since (URS-NF-011). */
const startedAt = Date.now();

export const metaRoutes = ({ reg }: Ctx): Route[] => [
  {
    method: 'GET',
    url: '/health',
    summary: 'Liveness check (URS-API-009), with the release version and start time.',
    responses: { 200: '{ status: "ok", version?, startedAt }' },
    handler: async () => ({ status: 'ok', ...(version && { version }), startedAt }),
  },
  {
    method: 'GET',
    url: '/v1/types',
    summary: 'Registered diagram types (URS-API-011).',
    responses: { 200: 'Array of { id, title, description, schema, examples, exports }' },
    handler: async () =>
      reg.types().map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        schema: `/v1/schema/${t.id}`,
        examples: t.examples.map((e) => ({ name: e.name, title: e.title })),
        exports: Object.keys(t.exports ?? {}),
      })),
  },
  {
    method: 'GET',
    url: '/v1/schema',
    summary: 'Combined JSON Schema for all types, dispatching on `type` (URS-API-004).',
    responses: { 200: 'JSON Schema (2020-12)' },
    handler: async () => combinedSchema(reg),
  },
  {
    method: 'GET',
    url: '/v1/schema/:type',
    summary: 'JSON Schema for one diagram type (URS-API-004).',
    responses: { 200: 'JSON Schema (2020-12)', 404: 'Unknown type: { diagnostics }' },
    handler: async (req, reply) => {
      const { type } = req.params as { type: string };
      const t = reg.type(type);
      if (!t) return reply.code(404).send({ diagnostics: [error('envelope.type', `unknown type '${type}'`)] });
      return { $schema: DIALECT, ...t.schema };
    },
  },
];
