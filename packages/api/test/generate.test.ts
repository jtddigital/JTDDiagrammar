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
    expect((await app.inject('/v1/ai')).json()).toEqual({ enabled: false, providers: [] });
    const render = await app.inject({ method: 'POST', url: '/v1/render', payload: { version: '1', type: 'flowchart', nodes: [{ id: 'a' }] } });
    expect(render.statusCode).toBe(200);
  });

  it('reports the model when enabled, and never holds or returns the key itself', async () => {
    const { app } = await start([]);
    expect((await app.inject('/v1/ai')).json()).toEqual({ enabled: true, model: 'claude-opus-5-5', providers: [{ id: 'claude', model: 'claude-opus-5-5' }] });
    const c = fromEnv({ ANTHROPIC_API_KEY: 'sk-ant-secret-value' });
    expect(c.ai.enabled).toBe(true);
    expect(JSON.stringify(c)).not.toContain('sk-ant-secret-value');
  });
});

describe('POST /v1/refine (URS-API-013)', () => {
  it('returns the refined, validated diagram', async () => {
    const source = { version: '1', type: 'flowchart', title: 'Refunds', nodes: [{ id: 'ask', style: { fill: '#ff0000' } }] };
    const { app } = await start([{ json: { ...source, nodes: [{ ...source.nodes[0], to: [{ node: 'pay' }] }, { id: 'pay' }] } }]);
    const res = await app.inject({ method: 'POST', url: '/v1/refine', payload: { source, instruction: 'add the payment step' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ valid: true, source: { nodes: [{ id: 'ask', style: { fill: '#ff0000' } }, { id: 'pay' }] } });
  });

  it('rejects a missing instruction', async () => {
    const { app } = await start([]);
    const res = await app.inject({ method: 'POST', url: '/v1/refine', payload: { source: { version: '1', type: 'flowchart', nodes: [] } } });
    expect([res.statusCode, res.json().diagnostics[0].code]).toEqual([400, 'ai.input']);
  });
});

describe('progress over SSE (URS-API-014, URS-AI-015)', () => {
  const events = (body: string) =>
    body
      .trim()
      .split('\n\n')
      .map((chunk) => {
        const [, event] = /^event: (.*)$/m.exec(chunk)!;
        const [, data] = /^data: (.*)$/m.exec(chunk)!;
        return { event, data: JSON.parse(data!) };
      });

  it('streams progress, then the result', async () => {
    const { app } = await start([{ json: flow }]);
    const res = await app.inject({ method: 'POST', url: '/v1/generate', headers: { accept: 'text/event-stream' }, payload: { text: 'x', type: 'flowchart' } });
    expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    const ev = events(res.body);
    expect(ev.map((e) => e.event)).toEqual(['progress', 'progress', 'progress', 'result']);
    expect(ev.slice(0, 3).map((e) => e.data.stage)).toEqual(['ingest', 'generate', 'validate']);
    expect(ev[3]!.data).toMatchObject({ valid: true, type: 'flowchart' });
  });

  it('ends with an error event carrying the status', async () => {
    const { app } = await start([{ text: '', stop: 'refusal' }]);
    const res = await app.inject({ method: 'POST', url: '/v1/generate', headers: { accept: 'text/event-stream' }, payload: { text: 'x', type: 'flowchart' } });
    expect(events(res.body).at(-1)).toEqual({ event: 'error', data: { status: 422, diagnostics: [expect.objectContaining({ code: 'ai.refusal' })] } });
  });
});

describe('rate limit (URS-AI-019)', () => {
  it('allows N AI requests per client per minute, then 429 with Retry-After', async () => {
    const { app } = await start([{ json: flow }, { json: flow }], { ratePerMinute: 2 });
    const go = () => app.inject({ method: 'POST', url: '/v1/generate', payload: { text: 'x', type: 'flowchart' } });
    expect([(await go()).statusCode, (await go()).statusCode]).toEqual([200, 200]);
    const third = await go();
    expect([third.statusCode, third.json().diagnostics[0].code]).toEqual([429, 'limit.rate']);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect((await app.inject({ method: 'POST', url: '/v1/render', payload: { version: '1', type: 'flowchart', nodes: [] } })).statusCode).toBe(200);
  });

  it('reads limits, output budget and prices from the environment', () => {
    const c = fromEnv({ AI_RATE_LIMIT: '0', AI_MAX_OUTPUT_TOKENS: '8000', AI_PRICES: '{"m":{"input":1,"output":2,"cacheRead":0,"cacheWrite":0}}' }).ai;
    expect([c.ratePerMinute, c.maxOutputTokens, c.prices?.m?.output]).toEqual([0, 8000, 2]);
    expect(fromEnv({ AI_PRICES: 'not json' }).ai.prices).toBeUndefined();
  });
});

describe('Microsoft 365 Copilot provider (URS-AI-023, URS-API-017)', () => {
  const copilotCfg = { clientId: 'app-id', tenantId: 'contoso.com', graphUrl: 'https://graph.example/beta', scopes: ['https://graph.microsoft.com/Mail.Read'] };
  async function withCopilot(replies: ScriptedReply[], claude = false, logger?: { level: string; stream: { write(l: string): void } }) {
    const seen: { token: string; timeZone?: string }[] = [];
    const mock = new MockClaude(replies);
    app = await buildApp(cfg({ copilot: copilotCfg }), {
      copilot: (token, timeZone) => (seen.push({ token, ...(timeZone && { timeZone }) }), mock),
      ...(claude && { claude: new MockClaude([]) }),
      ...(logger && { logger }),
    });
    return { app, seen, mock };
  }

  it('lists the public sign-in settings, and enables AI with Copilot alone', async () => {
    const { app } = await withCopilot([]);
    expect((await app.inject('/v1/ai')).json()).toEqual({ enabled: true, providers: [{ id: 'copilot', clientId: 'app-id', tenantId: 'contoso.com', scopes: copilotCfg.scopes }] });
  });

  it('acts as the signed-in user: the Graph token from the request, per request', async () => {
    const { app, seen } = await withCopilot([{ json: flow }]);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/generate',
      headers: { 'x-graph-token': 'user-token', 'x-time-zone': 'Europe/London' },
      payload: { text: 'x', type: 'flowchart', provider: 'copilot' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ valid: true });
    expect(seen).toEqual([{ token: 'user-token', timeZone: 'Europe/London' }]);
  });

  it('needs a Microsoft sign-in, and a known provider', async () => {
    const { app } = await withCopilot([], true);
    const no = await app.inject({ method: 'POST', url: '/v1/refine', payload: { source: { version: '1', type: 'flowchart', nodes: [] }, instruction: 'x', provider: 'copilot' } });
    expect([no.statusCode, no.json().diagnostics[0].code]).toEqual([401, 'ai.signin']);
    const bad = await app.inject({ method: 'POST', url: '/v1/generate', payload: { text: 'x', provider: 'gpt' } });
    expect([bad.statusCode, bad.json().diagnostics[0].code]).toEqual([400, 'ai.input']);
  });

  it('takes the provider from a multipart form, and ignores a malformed time zone', async () => {
    const { app, seen } = await withCopilot([{ json: flow }]);
    const m = await multipart({ text: 'x', type: 'flowchart', provider: 'copilot' }, []);
    const res = await app.inject({ method: 'POST', url: '/v1/generate', headers: { ...m.headers, 'x-graph-token': 't', 'x-time-zone': '../../etc' }, payload: m.payload });
    expect(res.statusCode).toBe(200);
    expect(seen).toEqual([{ token: 't' }]);
  });

  it('is unavailable when only Claude is configured', async () => {
    const { app } = await start([]);
    const res = await app.inject({ method: 'POST', url: '/v1/generate', headers: { 'x-graph-token': 't' }, payload: { text: 'x', provider: 'copilot' } });
    expect([res.statusCode, res.json().diagnostics[0].code]).toEqual([503, 'ai.disabled']);
  });

  it('never logs the Graph token (URS-AI-010)', async () => {
    const logs: string[] = [];
    const { app } = await withCopilot([{ json: flow }], false, { level: 'trace', stream: { write: (l: string) => void logs.push(l) } });
    await app.inject({ method: 'POST', url: '/v1/generate', headers: { 'x-graph-token': 'GRAPH-SECRET-42' }, payload: { text: 'x', type: 'flowchart', provider: 'copilot' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join('\n')).not.toContain('GRAPH-SECRET-42');
  });

  it('reads the app registration from the environment', () => {
    expect(fromEnv({}).ai.copilot).toBeUndefined();
    expect(fromEnv({ COPILOT_CLIENT_ID: 'id' }).ai.copilot).toEqual({
      clientId: 'id',
      tenantId: 'organizations',
      graphUrl: 'https://graph.microsoft.com/beta',
      scopes: ['Sites.Read.All', 'Mail.Read', 'People.Read.All', 'OnlineMeetingTranscript.Read.All', 'Chat.Read', 'ChannelMessage.Read.All', 'ExternalItem.Read.All'].map((s) => `https://graph.microsoft.com/${s}`),
    });
    expect(fromEnv({ COPILOT_CLIENT_ID: 'id', COPILOT_TENANT_ID: 't', COPILOT_SCOPES: 'WorkIQAgent.Ask, api://x/y' }).ai.copilot).toMatchObject({ tenantId: 't', scopes: ['https://graph.microsoft.com/WorkIQAgent.Ask', 'api://x/y'] });
  });
});
