import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { fromEnv, type Config } from '../src/config.ts';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync } from 'node:fs';
import { installation, latestRelease, newer, startUpdate, type Spawn } from '../src/update.ts';
import { installer, launcher } from '../src/updater.ts';

const cfg = (): Config => ({ ...fromEnv({}), webDist: undefined, renderWorkers: 1, registryModule: new URL('./registry-with-fixture.ts', import.meta.url).href }) as Config;

const homes: string[] = [];
/** An installed copy: JTD_HOME with versions/<tag>/bin/<installer> and `current` as bash or PowerShell leave it. */
function installed(tag = 'v1.0.0', flavour: 'bash' | 'powershell' = 'bash') {
  const home = mkdtempSync(join(tmpdir(), 'jtd-update-'));
  homes.push(home);
  const root = join(home, 'versions', tag);
  mkdirSync(join(root, 'bin'), { recursive: true });
  writeFileSync(join(root, 'bin', flavour === 'bash' ? 'install.sh' : 'install.ps1'), '');
  if (flavour === 'bash') symlinkSync(join('versions', tag), join(home, 'current'));
  else writeFileSync(join(home, 'current'), tag);
  return { home, root };
}
afterEach(() => {
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

/** A stand-in for the GitHub API. */
const github = (tag: string | undefined, status = 200) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    github.calls.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
    return new Response(tag ? JSON.stringify({ tag_name: tag }) : '{}', { status });
  }) as typeof fetch;
github.calls = [] as { url: string; auth: string | null }[];

/** A stand-in for spawning: records each call; `exit(code)` ends the first (the installer). */
function spawner() {
  const calls: { cmd: string; args: string[] }[] = [];
  const children: EventEmitter[] = [];
  const spawn: Spawn = (cmd, args) => {
    calls.push({ cmd, args });
    const child = Object.assign(new EventEmitter(), { unref() {}, pid: calls.length });
    children.push(child);
    return child as never;
  };
  const first = () => children[0]!;
  return { spawn, calls, exit: (code: number) => first().emit('exit', code), fail: (e: Error) => first().emit('error', e), say: (m: unknown) => first().emit('message', m) };
}

describe('updating in place (URS-NF-015)', () => {
  it('only updates installed copies, unless turned off', () => {
    const { home, root } = installed();
    expect(installation({ JTD_HOME: home }, root, 'v1.0.0')).toEqual({ version: 'v1.0.0', root, home, flavour: 'bash' });
    expect(installation({ JTD_HOME: home, UPDATES: 'off' }, root, 'v1.0.0')).toEqual({ reason: expect.stringMatching(/turned off/) });
    expect(installation({}, root, 'v1.0.0')).toEqual({ reason: expect.stringMatching(/not installed/) });
    expect(installation({ JTD_HOME: home }, root, undefined)).toEqual({ reason: expect.stringMatching(/not installed/) });
    expect(installation({ JTD_HOME: home }, tmpdir(), 'v1.0.0')).toEqual({ reason: expect.stringMatching(/not installed/) });
    const ps = installed('v2.0.0', 'powershell');
    expect(installation({ JTD_HOME: ps.home }, ps.root, 'v2.0.0')).toMatchObject({ flavour: 'powershell' });
  });

  it('compares releases by number', () => {
    expect(newer('v1.0.10', 'v1.0.9')).toBe(true);
    expect(newer('v1.1.0', 'v1.0.99')).toBe(true);
    expect(newer('v1.0.9', 'v1.0.9')).toBe(false);
    expect(newer('v0.9.0', 'v1.0.0')).toBe(false);
  });

  it('asks GitHub for the latest release, with the token, and says why when it cannot', async () => {
    github.calls = [];
    expect(await latestRelease({ JTD_REPO: 'o/r', JTD_API: 'https://gh.test/', GITHUB_TOKEN: 't' }, github('v1.2.3'))).toEqual({ tag: 'v1.2.3' });
    expect(github.calls).toEqual([{ url: 'https://gh.test/repos/o/r/releases/latest', auth: 'Bearer t' }]);
    expect(await latestRelease({}, github(undefined, 404))).toEqual({ reason: expect.stringMatching(/GITHUB_TOKEN/) });
    expect(await latestRelease({}, github('nonsense'))).toEqual({ reason: expect.stringMatching(/unexpected tag/) });
    expect(await latestRelease({}, (async () => Promise.reject(new Error('offline'))) as typeof fetch)).toEqual({ reason: expect.stringMatching(/reach GitHub/) });
  });

  it('starts the updater as a Node process of its own, with a channel back, logging to update.log', () => {
    const { home, root } = installed();
    const s = spawner();
    const opts: unknown[] = [];
    const spawn: Spawn = (cmd, args, o) => (opts.push(o), s.spawn(cmd, args, o));
    const { log } = startUpdate({ version: 'v1.0.0', root, home, flavour: 'bash' }, 'v1.1.0', {}, 'http://127.0.0.1:8080', spawn);
    expect(log).toBe(join(home, 'update.log'));
    expect(s.calls[0]!.cmd).toBe(process.execPath);
    expect(s.calls[0]!.args[0]).toMatch(/updater\.ts$/);
    expect(JSON.parse(s.calls[0]!.args[1]!)).toEqual({ flavour: 'bash', root, home, tag: 'v1.1.0', probe: 'http://127.0.0.1:8080', log });
    expect(opts[0]).toMatchObject({ detached: true, windowsHide: true, cwd: home, stdio: ['ignore', expect.any(Number), expect.any(Number), 'ipc'] });
    expect(readFileSync(log, 'utf8')).toMatch(/updating v1\.0\.0 to v1\.1\.0/);
  });

  it('runs each installer and launcher with plain arguments (PowerShell with -File)', () => {
    const j = { root: '/app', home: '/home', tag: 'v1.1.0', probe: '', log: '' };
    expect(installer({ ...j, flavour: 'bash' })).toEqual(['bash', [join('/app', 'bin', 'install.sh'), 'v1.1.0']]);
    expect(installer({ ...j, flavour: 'powershell' })[1]).toEqual(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join('/app', 'bin', 'install.ps1'), 'v1.1.0']);
    expect(launcher({ ...j, flavour: 'bash' }, '')).toEqual([join('/home', 'current', 'bin', 'jtddiagrammar'), ['start', '--no-open']]);
    expect(launcher({ ...j, flavour: 'powershell' }, 'v1.1.0-ab12')[1]).toEqual(['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join('/home', 'versions', 'v1.1.0-ab12', 'bin', 'jtddiagrammar.ps1'), 'start', '--no-open']);
  });

  it.skipIf(process.platform === 'win32')('installs, says so, waits for the old server, then starts and stays with the new launcher', async () => {
    const { home, root } = installed();
    const next = join(home, 'versions', 'v1.1.0');
    mkdirSync(join(next, 'bin'), { recursive: true });
    // A stand-in installer that switches `current`, and a launcher that notes it started.
    writeFileSync(join(root, 'bin', 'install.sh'), `echo installing "$1"; ln -sfn versions/v1.1.0 "${home}/current"\n`);
    writeFileSync(join(next, 'bin', 'jtddiagrammar'), `#!/usr/bin/env bash\necho "started $*"\n`);
    chmodSync(join(next, 'bin', 'jtddiagrammar'), 0o755);
    const log = join(home, 'update.log');
    const job = { flavour: 'bash', root, home, tag: 'v1.1.0', probe: 'http://127.0.0.1:9', log };
    const child = fork(new URL('../src/updater.ts', import.meta.url), [JSON.stringify(job)], { stdio: 'ignore' });
    const [message] = (await once(child, 'message')) as [unknown];
    expect(message).toEqual({ installed: 'v1.1.0' });
    const [code] = (await once(child, 'exit')) as [number];
    expect(code).toBe(0);
    expect(readFileSync(log, 'utf8')).toMatch(/installing v1\.1\.0[^]*installed v1\.1\.0[^]*started start --no-open/);
  });

  it.skipIf(process.platform === 'win32')('exits with the installer’s code when it fails, without starting anything', async () => {
    const { home, root } = installed();
    writeFileSync(join(root, 'bin', 'install.sh'), 'echo "checksum mismatch"; exit 3\n');
    const log = join(home, 'update.log');
    const child = fork(new URL('../src/updater.ts', import.meta.url), [JSON.stringify({ flavour: 'bash', root, home, tag: 'v1.1.0', probe: 'http://127.0.0.1:9', log })], { stdio: 'ignore' });
    const messages: unknown[] = [];
    child.on('message', (m) => messages.push(m));
    const [code] = (await once(child, 'exit')) as [number];
    expect([code, messages]).toEqual([3, []]);
    expect(readFileSync(log, 'utf8')).toMatch(/checksum mismatch[^]*the installer exited with 3/);
  });
});

describe('GET /v1/version and POST /v1/update (URS-WEB-022, URS-NF-015)', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  const start = async (over: { tag?: string; version?: string; installed?: boolean; env?: NodeJS.ProcessEnv } = {}) => {
    const inst = installed(over.version ?? 'v1.0.0');
    const s = spawner();
    const exits: number[] = [];
    app = await buildApp(cfg(), {
      update: { env: { ...(over.installed !== false && { JTD_HOME: inst.home }), ...over.env }, root: inst.root, version: 'version' in over ? over.version : 'v1.0.0', fetch: github(over.tag ?? 'v1.1.0'), spawn: s.spawn, exit: () => exits.push(1) },
    });
    return { ...s, inst, exits };
  };
  const ask = (headers: Record<string, string> = { 'x-jtd-update': '1' }, extra: object = {}) =>
    app!.inject({ method: 'POST', url: '/v1/update', headers: { 'content-type': 'application/json', ...headers }, payload: '{}', ...extra });

  it('reports the running version, the latest release, and whether this copy can update', async () => {
    await start();
    expect((await app!.inject('/v1/version')).json()).toEqual({ version: 'v1.0.0', latest: 'v1.1.0', updateAvailable: true, canUpdate: true, update: { state: 'idle' } });
    await app!.close();
    await start({ installed: false, tag: 'v1.0.0' });
    expect((await app!.inject('/v1/version')).json()).toMatchObject({ version: 'v1.0.0', updateAvailable: false, canUpdate: false, reason: expect.stringMatching(/not installed/) });
    await app!.close();
    await start({ version: undefined });
    expect((await app!.inject('/v1/version')).json()).toMatchObject({ version: 'dev', canUpdate: false });
  });

  it('starts the update for the app’s own page on this computer, once, and reports a failed one', async () => {
    const s = await start();
    const res = await ask({ 'x-jtd-update': '1', origin: 'http://localhost:80' }, { headers: { 'content-type': 'application/json', 'x-jtd-update': '1', host: 'localhost:80', origin: 'http://localhost:80' } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ state: 'updating', to: 'v1.1.0' });
    expect(s.calls).toHaveLength(1);
    expect((await ask()).statusCode).toBe(409);
    writeFileSync(join(s.inst.home, 'update.log'), 'downloading v1.1.0\njtddiagrammar: checksum mismatch; download aborted\n');
    s.exit(1);
    expect((await app!.inject('/v1/version')).json().update).toEqual({ state: 'failed', to: 'v1.1.0', log: expect.stringMatching(/checksum mismatch/) });
    // A failed install leaves this server running, and a later attempt may start.
    expect(s.exits).toEqual([]);
    expect((await ask()).statusCode).toBe(202);
  });

  it('reports an updater that cannot start, and keeps running', async () => {
    const s = await start();
    expect((await ask()).statusCode).toBe(202);
    s.fail(new Error('spawn EINVAL'));
    expect((await app!.inject('/v1/version')).json().update).toEqual({ state: 'failed', to: 'v1.1.0', log: expect.stringMatching(/could not start the updater: spawn EINVAL/) });
    expect(s.exits).toEqual([]);
  });

  it('stops once the updater says the release is installed, leaving the restart to it', async () => {
    const s = await start();
    expect((await ask()).statusCode).toBe(202);
    s.say({ installed: 'v0.0.1' });
    expect(s.exits).toEqual([]);
    s.say({ installed: 'v1.1.0' });
    expect(s.exits).toEqual([1]);
    expect(s.calls).toHaveLength(1);
    expect((await app!.inject('/v1/version')).json().update).toEqual({ state: 'restarting', to: 'v1.1.0' });
  });

  it('refuses other sites, other computers, and requests without its header', async () => {
    const s = await start();
    expect((await ask({})).statusCode).toBe(403);
    expect((await ask({ 'x-jtd-update': '1', origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await ask({ 'x-jtd-update': '1' }, { remoteAddress: '10.0.0.5' })).statusCode).toBe(403);
    expect(s.calls).toHaveLength(0);
  });

  it('refuses when up to date, not installed, or turned off', async () => {
    await start({ tag: 'v1.0.0' });
    expect((await ask()).json().diagnostics[0].code).toBe('update.current');
    await app!.close();
    await start({ installed: false });
    expect((await ask()).json().diagnostics[0].code).toBe('update.unavailable');
    await app!.close();
    await start({ env: { UPDATES: 'off' } });
    expect((await ask()).json().diagnostics[0]).toMatchObject({ code: 'update.unavailable', message: expect.stringMatching(/turned off/) });
  });
});
