import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { fromEnv, type Config, type CopilotConfig } from '../src/config.ts';

const copilot: CopilotConfig = { clientId: 'public-app', tenantId: 'contoso.com', graphUrl: 'https://graph.example', scopes: ['https://graph.microsoft.com/Mail.Read'], signIn: 'device', loginUrl: 'https://login.example' };
const cfg = (c?: CopilotConfig): Config => {
  const base = fromEnv({});
  return { ...base, webDist: undefined, renderWorkers: 1, ai: { ...base.ai, ...(c && { copilot: c }) } } as Config;
};
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

/** Stand-in for Microsoft's login service: answers each call in turn and records it. */
function login(...answers: object[]) {
  const calls: { url: string; form: Record<string, string> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: Object.fromEntries(new URLSearchParams(String(init.body))) });
    return new Response(JSON.stringify(answers.shift()), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

let app: FastifyInstance | undefined;
afterEach(() => app?.close());
const post = (url: string, payload?: object) => app!.inject({ method: 'POST', url, ...(payload && { payload }) });

describe('Microsoft device-code sign-in (URS-AI-024, URS-API-018)', () => {
  it('starts a sign-in for the configured app, tenant and Copilot permissions', async () => {
    const { f, calls } = login({ device_code: 'dc', user_code: 'ABCD-EFGH', verification_uri: 'https://microsoft.com/devicelogin', interval: 5, expires_in: 900, message: 'x' });
    app = await buildApp(cfg(copilot), { signInFetch: f });
    const res = await post('/v1/auth/microsoft/device');
    expect(res.json()).toEqual({ userCode: 'ABCD-EFGH', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc', interval: 5, expiresIn: 900 });
    expect(calls).toEqual([{ url: 'https://login.example/contoso.com/oauth2/v2.0/devicecode', form: { client_id: 'public-app', scope: 'https://graph.microsoft.com/Mail.Read openid profile offline_access' } }]);
    expect((await app.inject('/v1/ai')).json().providers[0]).toMatchObject({ id: 'copilot', signIn: 'device' });
  });

  it('reports pending until the user finishes, then returns the tokens and their name', async () => {
    const { f, calls } = login({ error: 'authorization_pending' }, { error: 'slow_down' }, { access_token: 'at', refresh_token: 'rt', expires_in: 3599, id_token: jwt({ name: 'Matt M' }) });
    app = await buildApp(cfg(copilot), { signInFetch: f });
    expect((await post('/v1/auth/microsoft/token', { deviceCode: 'dc' })).json()).toEqual({ pending: true });
    expect((await post('/v1/auth/microsoft/token', { deviceCode: 'dc' })).json()).toEqual({ pending: true });
    expect((await post('/v1/auth/microsoft/token', { deviceCode: 'dc' })).json()).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3599, account: 'Matt M' });
    expect(calls[0]).toEqual({ url: 'https://login.example/contoso.com/oauth2/v2.0/token', form: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'public-app', device_code: 'dc' } });
  });

  it('refreshes, and passes on why Microsoft refused', async () => {
    const { f, calls } = login({ access_token: 'at2', expires_in: 3600 }, { error: 'invalid_grant', error_description: 'AADSTS65001: The user or administrator has not consented.\r\nTrace ID: 123' });
    app = await buildApp(cfg(copilot), { signInFetch: f });
    expect((await post('/v1/auth/microsoft/token', { refreshToken: 'rt' })).json()).toEqual({ accessToken: 'at2', expiresIn: 3600 });
    expect(calls[0]!.form).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'rt', client_id: 'public-app' });
    const refused = await post('/v1/auth/microsoft/token', { deviceCode: 'dc' });
    expect([refused.statusCode, refused.json().diagnostics[0].message]).toEqual([400, 'AADSTS65001: The user or administrator has not consented.']);
    expect((await post('/v1/auth/microsoft/token', {})).statusCode).toBe(400);
  });

  it('says so when Microsoft cannot be reached', async () => {
    app = await buildApp(cfg(copilot), { signInFetch: (async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch });
    expect((await post('/v1/auth/microsoft/device')).statusCode).toBe(502);
  });

  it('exists only for device sign-in', async () => {
    app = await buildApp(cfg({ ...copilot, signIn: 'browser' }));
    expect((await post('/v1/auth/microsoft/device')).statusCode).toBe(404);
    expect(fromEnv({ COPILOT_CLIENT_ID: 'x', COPILOT_SIGNIN: 'device', COPILOT_LOGIN_URL: 'https://login.example/' }).ai.copilot).toMatchObject({ signIn: 'device', loginUrl: 'https://login.example' });
  });
});
