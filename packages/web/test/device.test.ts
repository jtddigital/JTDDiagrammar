// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceAccount, deviceSignOut, deviceToken, finishSignIn, startSignIn } from '../src/auth/device.ts';

const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function server(...answers: Response[]) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return answers.shift()!;
  });
  return calls;
}
const code = { userCode: 'ABCD-EFGH', verificationUri: 'https://microsoft.com/devicelogin', deviceCode: 'dc', interval: 1, expiresIn: 900 };
const noWait = async () => {};

afterEach(() => {
  vi.unstubAllGlobals();
  deviceSignOut();
});

describe('Microsoft device-code sign-in in the browser (URS-AI-024)', () => {
  it('gets a code, waits while pending, then keeps the token for this tab', async () => {
    const calls = server(reply(code), reply({ pending: true }), reply({ accessToken: 'at', refreshToken: 'rt', expiresIn: 3600, account: 'Matt M' }));
    expect(await startSignIn()).toEqual(code);
    expect(await finishSignIn(code, undefined, noWait)).toBe('Matt M');
    expect(calls.map((c) => c.url)).toEqual(['/v1/auth/microsoft/device', '/v1/auth/microsoft/token', '/v1/auth/microsoft/token']);
    expect(calls[1]!.body).toEqual({ deviceCode: 'dc' });
    expect(deviceAccount()).toBe('Matt M');
    expect(await deviceToken()).toBe('at');
  });

  it('refreshes a token close to expiry, and signs out when refresh fails', async () => {
    server(reply({ accessToken: 'old', refreshToken: 'rt', expiresIn: 60, account: 'M' }), reply({ accessToken: 'new', expiresIn: 3600 }), reply({ diagnostics: [{ message: 'AADSTS70043: expired' }] }, 400));
    await finishSignIn(code, undefined, noWait);
    expect(await deviceToken()).toBe('new');
    expect(deviceAccount()).toBe('M');
    sessionStorage.setItem('jtd:microsoft', JSON.stringify({ accessToken: 'x', refreshToken: 'rt', expiresAt: 0 }));
    await expect(deviceToken()).rejects.toThrow('AADSTS70043: expired');
    expect(deviceAccount()).toBeUndefined();
  });

  it('asks to sign in when there is no session, and reports Microsoft refusals', async () => {
    await expect(deviceToken()).rejects.toThrow('Sign in with Microsoft first.');
    server(reply({ diagnostics: [{ message: 'AADSTS65001: consent needed' }] }, 400));
    await expect(finishSignIn(code, undefined, noWait)).rejects.toThrow('AADSTS65001: consent needed');
    await expect(finishSignIn({ ...code, expiresIn: 0 }, undefined, noWait)).rejects.toThrow('The sign-in code expired');
  });
});
