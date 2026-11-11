import { combinedSchema, createRegistry, render } from '@jtd/core';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { fromEnv, type Config } from '../src/config.ts';

const cfg = (over: Partial<Config> = {}): Config => ({
  ...fromEnv({}),
  webDist: undefined,
  renderWorkers: 1,
  registryModule: new URL('./registry-with-fixture.ts', import.meta.url).href,
  ...over,
}) as Config;

const flow = { version: '1', type: 'flowchart', title: 'T', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] };
const post = (app: FastifyInstance, url: string, body: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, headers: { 'content-type': 'application/json', ...headers }, payload: typeof body === 'string' ? body : JSON.stringify(body) });

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp(cfg({ maxNodes: 50, bodyLimit: 4096 }));
});
afterAll(() => app.close());

describe('POST /v1/render (URS-API-002, URS-API-005)', () => {
  it('returns the same SVG as the core renderer', async () => {
    const res = await post(app, '/v1/render', flow);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(res.body).toBe(render(flow, createRegistry()).svg);
  });

  it('returns { svg, diagnostics } for Accept: application/json', async () => {
    const res = await post(app, '/v1/render', flow, { accept: 'application/json' });
    expect(res.json()).toEqual({ svg: render(flow, createRegistry()).svg, diagnostics: [] });
  });

  it('renders a type registered only in the test registry (URS-EXT-002)', async () => {
    const res = await post(app, '/v1/render', { version: '1', type: 'checklist', items: [{ id: 'a', label: 'A' }] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('class="jtd jtd-checklist"');
  });

  it('rejects invalid diagrams with 400 and diagnostics', async () => {
    const res = await post(app, '/v1/render', { version: '1', type: 'flowchart', nodes: [{ id: 'a', shape: 'hex' }] });
    expect(res.statusCode).toBe(400);
    expect(res.json().diagnostics[0]).toMatchObject({ code: 'schema.enum', path: '/nodes/0/shape' });
  });

  it('rejects malformed JSON and non-JSON bodies', async () => {
    expect((await post(app, '/v1/render', '{"version":')).json()).toEqual({ diagnostics: [expect.objectContaining({ code: 'parse.json' })] });
    const res = await app.inject({ method: 'POST', url: '/v1/render', headers: { 'content-type': 'text/plain' }, payload: 'x' });
    expect(res.statusCode).toBe(415);
  });
});

describe('limits (URS-API-006)', () => {
  it('413 for oversized bodies', async () => {
    const res = await post(app, '/v1/render', { ...flow, title: 'x'.repeat(5000) });
    expect([res.statusCode, res.json().diagnostics[0].code]).toEqual([413, 'limit.body']);
  });

  it('413 for too many nodes', async () => {
    const nodes = Array.from({ length: 51 }, (_, i) => ({ id: `n${i}` }));
    const res = await post(app, '/v1/render', { version: '1', type: 'flowchart', nodes });
    expect([res.statusCode, res.json().diagnostics[0].code]).toEqual([413, 'limit.nodes']);
  });

  it('422 when rendering exceeds the time limit, and the pool recovers', async () => {
    const slow = await buildApp(cfg({ renderTimeoutMs: 1 }));
    try {
      const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}` }));
      const edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id }));
      const res = await post(slow, '/v1/render', { version: '1', type: 'flowchart', nodes, edges });
      expect([res.statusCode, res.json().diagnostics[0].code]).toEqual([422, 'limit.time']);
    } finally {
      await slow.close();
    }
    expect((await post(app, '/v1/render', flow)).statusCode).toBe(200);
  });
});

describe('other endpoints', () => {
  it('POST /v1/validate reports validity (URS-API-003)', async () => {
    expect((await post(app, '/v1/validate', flow)).json()).toEqual({ valid: true, diagnostics: [] });
    const bad = (await post(app, '/v1/validate', { version: '1', type: 'flowchart', nodes: [], edges: [{ from: 'x', to: 'y' }] })).json();
    expect(bad.valid).toBe(false);
    expect(bad.diagnostics.map((d: { code: string }) => d.code)).toEqual(['ref.edge', 'ref.edge']);
  });

  it('GET /v1/types lists registered types (URS-API-011)', async () => {
    const types = (await app.inject('/v1/types')).json();
    expect(types.map((t: { id: string }) => t.id)).toEqual(['flowchart', 'state', 'checklist']);
    expect(types[0]).toMatchObject({ schema: '/v1/schema/flowchart', examples: [{ name: 'basic' }, { name: 'cross-functional' }] });
  });

  it('GET /v1/schema[/{type}] (URS-API-004)', async () => {
    expect((await app.inject('/v1/schema')).json()).toEqual(JSON.parse(JSON.stringify(combinedSchema(createRegistry().registerType((await import('../../core/test/fixture-type.ts')).checklist)))));
    expect((await app.inject('/v1/schema/flowchart')).json()).toMatchObject({ $id: 'urn:jtd:schema:v1:flowchart' });
    expect((await app.inject('/v1/schema/gantt')).statusCode).toBe(404);
  });

  it('GET /health (URS-API-009)', async () => {
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' });
  });

  it('GET /v1/openapi.json documents every route (URS-API-008)', async () => {
    const doc = (await app.inject('/v1/openapi.json')).json();
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).sort()).toEqual(['/health', '/v1/ai', '/v1/generate', '/v1/openapi.json', '/v1/render', '/v1/schema', '/v1/schema/{type}', '/v1/types', '/v1/validate']);
    expect(Object.keys(doc.paths['/v1/generate'].post.requestBody.content)).toEqual(['multipart/form-data', 'application/json']);
    expect(doc.paths['/v1/render'].post.requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/Diagram' });
  });

  it('sets nosniff on every response', async () => {
    expect((await app.inject('/health')).headers['x-content-type-options']).toBe('nosniff');
  });
});
