/**
 * Install-and-launch test (URS-NF-010, URS-NF-011), run per OS in CI: pack a release, serve it from a
 * stand-in GitHub API that demands a token (as for a private repo), install it into a temporary
 * home with the real installer, start it with the real launcher, and probe it. Then update in place.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ASSET, pack } from './pack.ts';

const TAG = 'v9.9.9';
const TOKEN = 'e2e-token';
const win = process.platform === 'win32';

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
const installer = win
  ? ['powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(out, 'install.ps1')]]
  : ['bash', [join(out, 'install.sh')]];
const launcher = win ? join(home, 'bin', 'jtddiagrammar.cmd') : join(home, 'bin', 'jtddiagrammar');
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
  const first = await run(installer[0] as string, installer[1] as string[]);
  process.stderr.write(first.stderr);
  check(first.status === 0, 'installs the latest release with a token');
  check((await run(launcher, ['version'])).stdout.trim() === TAG, 'launcher reports the installed version');

  const port = 18_000 + Math.floor(Math.random() * 1000);
  app = spawn(launcher, ['start', '--port', String(port), '--no-open'], { env, stdio: 'inherit', shell: win });
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

  const again = await run(installer[0] as string, [...(installer[1] as string[]), TAG]);
  check(again.status === 0 && gh.downloads() === 4, 'updates in place to a named release');
  const denied = await run(installer[0] as string, installer[1] as string[], { GITHUB_TOKEN: 'wrong' });
  check(denied.status !== 0 && /GITHUB_TOKEN/.test(denied.stderr + denied.stdout), 'explains a refused private repository');
} finally {
  if (app?.pid) {
    if (win) spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F']);
    else app.kill('SIGTERM');
  }
  gh.server.close();
  await new Promise((r) => setTimeout(r, 500));
  rmSync(out, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true, maxRetries: 5 });
}
