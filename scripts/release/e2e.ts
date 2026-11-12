/**
 * Install-and-launch test (URS-NF-010, URS-NF-011), run per OS in CI: pack a release, serve it from a
 * stand-in GitHub API that demands a token (as for a private repo), install it into a temporary
 * home with the real installer, start it with the real launcher, and probe it. Then update in place.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET, pack } from './pack.ts';

const TAG = 'v9.9.9';
const TOKEN = 'e2e-token';
const win = process.platform === 'win32';
/** PowerShell to test with: Windows PowerShell 5.1 by default on Windows; JTD_E2E_PS=pwsh also runs the Windows scripts elsewhere. */
const ps = process.env.JTD_E2E_PS || (win ? 'powershell' : undefined);
/** JTD_E2E_LEGACY=1 makes PowerShell 7 pass native arguments the way Windows PowerShell 5.1 does (quotes stripped). */
const legacy = Boolean(process.env.JTD_E2E_LEGACY);

function check(ok: unknown, what: string): void {
  if (!ok) throw new Error(`release e2e: ${what}`);
  console.log(`ok - ${what}`);
}

/** Stand-in for api.github.com: release metadata and asset downloads, token required. */
async function fakeGitHub(dir: string) {
  let downloads = 0;
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(404).end('{"message":"Not Found"}');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (req.url === '/repos/test/repo/releases/latest' || req.url === `/repos/test/repo/releases/tags/${TAG}`) {
      const assets = [ASSET, `${ASSET}.sha256`].map((name, i) => ({ name, url: `${base}/assets/${i}` }));
      return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ tag_name: TAG, assets }));
    }
    // A release made on the releases page, without the workflow's files.
    if (req.url === '/repos/test/repo/releases/tags/v0.0.1') return res.writeHead(200).end(JSON.stringify({ tag_name: 'v0.0.1', assets: [] }));
    const m = /^\/assets\/([01])$/.exec(req.url ?? '');
    if (m && req.headers.accept === 'application/octet-stream') {
      downloads++;
      return res.writeHead(200).end(readFileSync(join(dir, m[1] === '0' ? ASSET : `${ASSET}.sha256`)));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, downloads: () => downloads };
}

const out = mkdtempSync(join(tmpdir(), 'jtd-release-'));
const home = mkdtempSync(join(tmpdir(), 'jtd-home-'));
pack(TAG, out);
const gh = await fakeGitHub(out);
const env = { ...process.env, JTD_API: gh.url, JTD_REPO: 'test/repo', JTD_HOME: home, JTD_BIN: join(home, 'bin'), GITHUB_TOKEN: TOKEN, GH_TOKEN: '' };
/** PowerShell arguments that run script `f` with `extra` arguments. */
const psArgs = (f: string, extra: string[]) =>
  legacy
    ? ['-NoProfile', '-Command', `$PSNativeCommandArgumentPassing = 'Legacy'; & '${f}' ${extra.map((x) => `'${x}'`).join(' ')}; exit $LASTEXITCODE`]
    : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f, ...extra];
const installer = (...extra: string[]): [string, string[]] => (ps ? [ps, psArgs(join(out, 'install.ps1'), extra)] : ['bash', [join(out, 'install.sh'), ...extra]]);
// The .cmd shim needs cmd.exe; elsewhere the PowerShell launcher is called directly.
const launcher = (...extra: string[]): [string, string[]] =>
  win
    ? [join(home, 'bin', 'jtddiagrammar.cmd'), extra]
    : ps
      ? [ps, psArgs(join(home, 'versions', readFileSync(join(home, 'current'), 'utf8').trim(), 'bin', 'jtddiagrammar.ps1'), extra)]
      : [join(home, 'bin', 'jtddiagrammar'), extra];
/** Stop the launcher and the server it started. */
function stop(p: ChildProcess | undefined): void {
  if (!p?.pid || p.exitCode !== null) return;
  if (win) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F']);
  else process.kill(-p.pid, 'SIGTERM'); // the launcher's whole process group
}

/** Async, so the stand-in server in this process keeps answering. */
async function run(cmd: string, args: string[], extra = {}) {
  const p = spawn(cmd, args, { env: { ...env, ...extra }, shell: win && cmd.endsWith('.cmd') });
  let stdout = '';
  let stderr = '';
  p.stdout.on('data', (d) => (stdout += d));
  p.stderr.on('data', (d) => (stderr += d));
  const [status] = (await once(p, 'close')) as [number];
  return { status, stdout, stderr };
}

let app: ChildProcess | undefined;
try {
  const first = await run(...installer());
  process.stderr.write(first.stderr);
  check(first.status === 0, 'installs the latest release with a token');
  check((await run(...launcher('version'))).stdout.trim() === TAG, 'launcher reports the installed version');

  const port = 18_000 + Math.floor(Math.random() * 1000);
  app = spawn(...launcher('start', '--port', String(port), '--no-open'), { env, stdio: 'inherit', shell: win, detached: !win });
  const url = `http://localhost:${port}`;
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    up = await fetch(`${url}/health`).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  check(up, 'launcher starts the app');
  check((await (await fetch(url)).text()).includes('<div id="root">'), 'serves the web app');
  const svg = await fetch(`${url}/v1/render`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"version":"1","type":"flowchart","nodes":[{"id":"a"}]}' });
  check((await svg.text()).startsWith('<svg'), 'renders through the API');

  const again = await run(...installer(TAG));
  check(again.status === 0 && gh.downloads() === 4, 'updates in place to a named release');
  const bare = await run(...installer('v0.0.1'));
  check(bare.status !== 0 && /v0\.0\.1 has no jtddiagrammar\.tar\.gz attached/.test(bare.stderr + bare.stdout), 'explains a release without the app bundle');
  const denied = await run(...installer(), { GITHUB_TOKEN: 'wrong' });
  check(denied.status !== 0 && /GITHUB_TOKEN/.test(denied.stderr + denied.stdout), 'explains a refused private repository');

  if (ps) {
    // Users quit the app before uninstalling; a running server could hold files open.
    stop(app);
    app = undefined;
    await new Promise((r) => setTimeout(r, 1000));
    const removed = await run(...launcher('uninstall'));
    // Windows deletes in a detached process once the launcher exits; a node_modules tree can take a while on a busy runner.
    let gone = false;
    for (let i = 0; i < 120 && !(gone = !existsSync(home)); i++) await new Promise((r) => setTimeout(r, 500));
    // The listing can race a deletion still in progress, so it must not throw.
    const left = () => {
      try {
        return readdirSync(home, { recursive: true }).slice(0, 40);
      } catch (e) {
        return String(e);
      }
    };
    if (!gone) console.error({ uninstall: removed, left: left() });
    check(removed.status === 0 && gone, 'uninstall removes the installation');
  }
} finally {
  stop(app);
  gh.server.close();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(out, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true, maxRetries: 5 });
}
