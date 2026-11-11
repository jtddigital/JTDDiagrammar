import { MockClaude, type ScriptedReply } from '@jtd/ai';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { fromEnv, type Config } from '../src/config.ts';

const flow = {
  title: 'Refunds',
  direction: 'LR',
  lanes: [{ id: 'cs', label: 'Support' }, { id: 'fin', label: 'Finance' }],
  nodes: [
    { id: 'ask', shape: 'terminator', label: 'Request', lane: 'cs' },
    { id: 'pay', shape: 'process', label: 'Pay', lane: 'fin' },
  ],
  edges: [{ from: 'ask', to: 'pay' }],
};

const cfg = (ai: Partial<Config['ai']> = {}): Config => {
  const base = fromEnv({});
  return { ...base, webDist: undefined, renderWorkers: 1, ai: { ...base.ai, ...ai } } as Config;
};

let app: FastifyInstance | undefined;
afterEach(() => app?.close());

async function start(replies?: ScriptedReply[], ai: Partial<Config['ai']> = {}) {
  const claude = replies && new MockClaude(replies);
  app = await buildApp(cfg(ai), claude ? { claude } : {});
  return { app, claude };
}

async function multipart(fields: Record<string, string>, files: [string, string, string][]) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const [name, type, content] of files) fd.append('files', new Blob([content], { type }), name);
  const req = new Request('http://local/', { method: 'POST', body: fd });
  return { headers: { 'content-type': req.headers.get('content-type')! }, payload: Buffer.from(await req.arrayBuffer()) };
}

describe('POST /v1/generate (URS-API-012)', () => {
  it('generates validated source and SVG from JSON text', async () => {
    const { app } = await start([{ json: flow }]);
    const res = await app.inject({ method: 'POST', url: '/v1/generate', payload: { text: 'Support takes requests; Finance pays.', type: 'flowchart' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ type: 'flowchart', valid: true, attempts: 1, diagnostics: [], source: { version: '1', type: 'flowchart', title: 'Refunds' } });
    expect(body.svg).toMatch(/^<svg /);
    expect(body.usage).toEqual({ input: 100, output: 50, cacheRead: 80, cacheWrite: 0 });
  });

  it('accepts multipart uploads and validates through the render workers, repairing once', async () => {
    const bad = { ...flow, nodes: [flow.nodes[0], { ...flow.nodes[1], lane: 'nope' }] };
    const { app, claude } = await start([{ json: bad }, { json: flow }]);
    const res = await app.inject({ method: 'POST', url: '/v1/generate', ...(await multipart({ type: 'flowchart' }, [['notes.md', 'text/markdown', '# Refunds']])) });
    expect(res.json()).toMatchObject({ valid: true, attempts: 2 });
    expect(JSON.stringify(claude!.requests[0]!.messages)).toContain('<document name=\\"notes.md\\">');
  });

  it('maps AI failures to HTTP statuses (URS-AI-008, URS-AI-009)', async () => {
    const { app } = await start([{ text: '', stop: 'refusal' }], { maxFiles: 1 });
    const refused = await app.inject({ method: 'POST', url: '/v1/generate', payload: { text: 'x', type: 'flowchart' } });
    expect([refused.statusCode, refused.json().diagnostics[0].code]).toEqual([422, 'ai.refusal']);
    const exe = await app.inject({ method: 'POST', url: '/v1/generate', ...(await multipart({}, [['a.exe', 'application/octet-stream', 'MZ']])) });
    expect([exe.statusCode, exe.json().diagnostics[0].code]).toEqual([415, 'ai.media-type']);
    const two = await app.inject({ method: 'POST', url: '/v1/generate', ...(await multipart({}, [['a.txt', 'text/plain', 'a'], ['b.txt', 'text/plain', 'b']])) });
    expect([two.statusCode, two.json().diagnostics[0].code]).toEqual([413, 'limit.files']);
    const empty = await app.inject({ method: 'POST', url: '/v1/generate', payload: { type: 'flowchart' } });
    expect([empty.statusCode, empty.json().diagnostics[0].code]).toEqual([400, 'ai.input']);
  });
});

describe('without AI credentials (URS-API-015, URS-API-016, URS-AI-010)', () => {
  it('generate returns 503, /v1/ai says disabled, everything else works', async () => {
    const { app } = await start(undefined, { enabled: false });
    const res = await app.inject({ method: 'POST', url: '/v1/generate', payload: { text: 'x' } });
    expect([res.statusCode, res.json().diagnostics[0].code]).toEqual([503, 'ai.disabled']);
    expect((await app.inject('/v1/ai')).json()).toEqual({ enabled: false });
    const render = await app.inject({ method: 'POST', url: '/v1/render', payload: { version: '1', type: 'flowchart', nodes: [{ id: 'a' }] } });
    expect(render.statusCode).toBe(200);
  });

  it('reports the model when enabled, and never holds or returns the key itself', async () => {
    const { app } = await start([]);
    expect((await app.inject('/v1/ai')).json()).toEqual({ enabled: true, model: 'claude-opus-5-5' });
    const c = fromEnv({ ANTHROPIC_API_KEY: 'sk-ant-secret-value' });
    expect(c.ai.enabled).toBe(true);
    expect(JSON.stringify(c)).not.toContain('sk-ant-secret-value');
  });
});
