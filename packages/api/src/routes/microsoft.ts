import { error } from '@jtd/core';
import type { CopilotConfig } from '../config.ts';
import type { Route } from './route.ts';

/**
 * Microsoft device-code sign-in for Microsoft 365 Copilot (URS-AI-024, URS-API-018), the flow
 * `Connect-MgGraph -UseDeviceCode` uses. Microsoft's token endpoint refuses browser requests for
 * public client apps, so the server relays them. It is stateless: codes and tokens go back to the
 * browser that asked, and are never stored or logged here.
 */
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

interface TokenReply {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

/** Display name from the ID token. Shown only; the API never trusts it. */
function accountOf(idToken?: string): string | undefined {
  try {
    const claims = JSON.parse(Buffer.from(idToken!.split('.')[1]!, 'base64url').toString('utf8')) as { name?: string; preferred_username?: string };
    return claims.name ?? claims.preferred_username;
  } catch {
    return undefined;
  }
}

/** Microsoft's own explanation, without its trace and correlation ids. */
const reason = (r: TokenReply) => (r.error_description ?? r.error ?? 'sign-in failed').split(/\r?\n/)[0]!.slice(0, 300);

export function microsoftRoutes(cfg: CopilotConfig | undefined, fetchFn: typeof fetch = fetch): Route[] {
  if (cfg?.signIn !== 'device') return [];
  const endpoint = (path: string) => `${cfg.loginUrl}/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/${path}`;
  const scope = [...cfg.scopes, 'openid', 'profile', 'offline_access'].join(' ');
  const post = async (path: string, form: Record<string, string>) => {
    const res = await fetchFn(endpoint(path), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  };
  const unreachable = { diagnostics: [error('ai.signin', 'Microsoft sign-in could not be reached')] };

  return [
    {
      method: 'POST',
      url: '/v1/auth/microsoft/device',
      summary: 'Start a Microsoft device-code sign-in for Copilot (URS-API-018). Only with COPILOT_SIGNIN=device.',
      responses: { 200: '{ userCode, verificationUri, deviceCode, interval, expiresIn }', 502: 'Microsoft sign-in failed or could not be reached' },
      handler: async (_req, reply) => {
        const r = await post('devicecode', { client_id: cfg.clientId, scope }).catch(() => undefined);
        if (!r) return reply.code(502).send(unreachable);
        if (typeof r.device_code !== 'string') return reply.code(502).send({ diagnostics: [error('ai.signin', reason(r as TokenReply))] });
        return { userCode: r.user_code, verificationUri: r.verification_uri, deviceCode: r.device_code, interval: r.interval ?? 5, expiresIn: r.expires_in ?? 900 };
      },
    },
    {
      method: 'POST',
      url: '/v1/auth/microsoft/token',
      summary: 'Finish a device-code sign-in (`deviceCode`) or refresh (`refreshToken`) (URS-API-018).',
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { deviceCode: { type: 'string' }, refreshToken: { type: 'string' } } } } } },
      responses: { 200: '{ pending: true } while the user has not finished; else { accessToken, refreshToken, expiresIn, account? }', 400: 'Missing code, or Microsoft refused (expired, declined, consent needed)', 502: 'Microsoft sign-in could not be reached' },
      handler: async (req, reply) => {
        const { deviceCode, refreshToken } = (req.body ?? {}) as { deviceCode?: unknown; refreshToken?: unknown };
        const form: Record<string, string> | undefined =
          typeof deviceCode === 'string' && deviceCode
            ? { grant_type: DEVICE_GRANT, client_id: cfg.clientId, device_code: deviceCode }
            : typeof refreshToken === 'string' && refreshToken
              ? { grant_type: 'refresh_token', client_id: cfg.clientId, refresh_token: refreshToken, scope }
              : undefined;
        if (!form) return reply.code(400).send({ diagnostics: [error('ai.signin', 'send deviceCode or refreshToken')] });
        const r = (await post('token', form).catch(() => undefined)) as TokenReply | undefined;
        if (!r) return reply.code(502).send(unreachable);
        if (r.error === 'authorization_pending' || r.error === 'slow_down') return { pending: true };
        if (!r.access_token) return reply.code(400).send({ diagnostics: [error('ai.signin', reason(r))] });
        const account = accountOf(r.id_token);
        return { accessToken: r.access_token, ...(r.refresh_token && { refreshToken: r.refresh_token }), expiresIn: r.expires_in ?? 3600, ...(account && { account }) };
      },
    },
  ];
}
