import { combinedSchema, type Registry } from '@jtd/core';
import type { Route } from './routes/route.ts';

/** OpenAPI 3.1 document derived from the route table, so it cannot drift from the routes (URS-API-008). */
export function openapi(routes: readonly Route[], reg: Registry): object {
  const paths: Record<string, Record<string, object>> = {};
  for (const r of routes) {
    const path = r.url.replace(/:(\w+)/g, '{$1}');
    const params = [...r.url.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: { type: 'string' } }));
    (paths[path] ??= {})[r.method.toLowerCase()] = {
      summary: r.summary,
      ...(params.length && { parameters: params }),
      ...(r.body && {
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Diagram' } },
            'application/xml': { schema: { type: 'string', description: 'The same document as XML (<diagram> root)' } },
            'application/yaml': { schema: { type: 'string', description: 'The same document as YAML' } },
          },
        },
      }),
      ...(r.requestBody && { requestBody: r.requestBody }),
      responses: Object.fromEntries(Object.entries(r.responses).map(([code, description]) => [code, { description }])),
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'JTDDiagrammar API', version: '1', license: { name: 'MIT', identifier: 'MIT' } },
    paths,
    components: { schemas: { Diagram: combinedSchema(reg) } },
  };
}
