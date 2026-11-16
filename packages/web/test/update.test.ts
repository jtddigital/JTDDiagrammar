// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startUpdate, versionInfo, waitForUpdate } from '../src/update/api.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('version and updating from the app (URS-WEB-022, URS-NF-015)', () => {
  it('reads the version, and treats a missing server as nothing to show', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ version: 'v1.0.0', updateAvailable: false, canUpdate: true, update: { state: 'idle' } })));
    expect((await versionInfo())?.version).toBe('v1.0.0');
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('down'))));
    expect(await versionInfo()).toBeUndefined();
  });

  it('asks the server with its own header, and passes on a refusal', async () => {
    const f = vi.fn(async () => json({ state: 'updating', to: 'v1.1.0' }, 202));
    vi.stubGlobal('fetch', f);
    expect(await startUpdate()).toEqual({ to: 'v1.1.0' });
    expect(f.mock.calls[0]).toEqual(['/v1/update', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'x-jtd-update': '1' }) })]);
    vi.stubGlobal('fetch', vi.fn(async () => json({ diagnostics: [{ message: 'v1.0.0 is the latest release' }] }, 409)));
    await expect(startUpdate()).rejects.toThrow('v1.0.0 is the latest release');
  });

  it('waits through the restart for the new version, and stops on a failure or after the limit', async () => {
    const sleep = async () => {};
    const answers = [Promise.reject(new Error('restarting')), json({ version: 'v1.0.0' }), json({ version: 'v1.1.0' })];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/health' ? answers.shift()! : json({ update: { state: 'updating', to: 'v1.1.0' } }))));
    expect(await waitForUpdate('v1.1.0', { sleep })).toEqual({ done: true });

    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/health' ? json({ version: 'v1.0.0' }) : json({ update: { state: 'failed', to: 'v1.1.0', log: 'checksum mismatch' } }))));
    expect(await waitForUpdate('v1.1.0', { sleep })).toEqual({ done: false, log: 'checksum mismatch' });

    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === '/health' ? json({ version: 'v1.0.0' }) : json({ update: { state: 'updating', to: 'v1.1.0' } }))));
    expect(await waitForUpdate('v1.1.0', { sleep, every: 10, limit: 50 })).toEqual({ done: false });
  });
});
