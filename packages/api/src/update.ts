import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

/** How this copy was installed, if it can update itself (URS-NF-015). */
export interface Installation {
  version: string;
  root: string;
  home: string;
  /** PowerShell-installed copies name the current version in a file; bash ones link to it. */
  flavour: 'bash' | 'powershell';
}

const TAG = /^v\d+\.\d+\.\d+([-+][\w.-]+)?$/;

/**
 * An installed copy that may update itself, or why not: it needs a release VERSION, a JTD_HOME it sits
 * in (versions/<tag>), and its installer; `UPDATES=off` turns updating off. A source checkout or a
 * Docker image has no installer and never updates itself.
 */
export function installation(env: NodeJS.ProcessEnv, root: string, version: string | undefined): Installation | { reason: string } {
  if (env.UPDATES === 'off') return { reason: 'Updates are turned off (UPDATES=off in config.env).' };
  const home = env.JTD_HOME;
  // The native call gives each path's canonical form; on Windows the launcher may pass a short (8.3) name.
  const inside = (dir: string, path: string) => {
    const rel = relative(realpathSync.native(dir), realpathSync.native(path));
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  };
  if (!version || !home || !existsSync(join(home, 'versions')) || !inside(join(home, 'versions'), root))
    return { reason: 'This copy was not installed with the installer, so it cannot update itself.' };
  const current = join(home, 'current');
  const flavour = existsSync(current) && lstatSync(current).isFile() ? 'powershell' : 'bash';
  if (!existsSync(join(root, 'bin', flavour === 'bash' ? 'install.sh' : 'install.ps1'))) return { reason: 'The installer is missing from this copy.' };
  return { version, root, home, flavour };
}

/** `a` is a later release than `b` (vMAJOR.MINOR.PATCH; anything after the patch is ignored). */
export function newer(a: string, b: string): boolean {
  const n = (v: string) => (/^v?(\d+)\.(\d+)\.(\d+)/.exec(v) ?? [0, 0, 0, 0]).slice(1).map(Number);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

/** The latest release's tag from the GitHub API, with the same repository, host and token the installer uses. */
export async function latestRelease(env: NodeJS.ProcessEnv, fetcher: typeof fetch): Promise<{ tag: string } | { reason: string }> {
  const repo = env.JTD_REPO || 'jtddigital/JTDDiagrammar';
  const api = (env.JTD_API || 'https://api.github.com').replace(/\/$/, '');
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  try {
    const res = await fetcher(`${api}/repos/${repo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token && { authorization: `Bearer ${token}` }) },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { reason: token ? 'No release found.' : 'Cannot see releases: for a private repository, set GITHUB_TOKEN in config.env.' };
    if (!res.ok) return { reason: `GitHub answered ${res.status}.` };
    const tag = ((await res.json()) as { tag_name?: unknown }).tag_name;
    return typeof tag === 'string' && TAG.test(tag) ? { tag } : { reason: 'The latest release has an unexpected tag.' };
  } catch {
    return { reason: 'Cannot reach GitHub to check for updates.' };
  }
}

export type Spawn = (cmd: string, args: string[], opts: SpawnOptions) => Pick<ChildProcess, 'once' | 'on' | 'unref' | 'pid'>;
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

const SHELL = { bash: 'bash', powershell: process.platform === 'win32' ? 'powershell' : 'pwsh' } as const;
const PS = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command'];
/**
 * Run `cmd` in a process of its own that outlives this server, its output going to `log` after a line
 * saying what runs. A process that cannot start is an 'error' event: always listened to, so it can never
 * bring this server down.
 */
function detached(spawn: Spawn, inst: Installation, env: NodeJS.ProcessEnv, log: string, flags: 'w' | 'a', cmd: string, args: string[]) {
  const fd = openSync(log, flags);
  try {
    writeSync(fd, `${new Date().toISOString()} running: ${[cmd, ...args].join(' ')}\n`);
    const child = spawn(cmd, args, { env, detached: true, stdio: ['ignore', fd, fd], windowsHide: true, cwd: inst.home });
    child.on('error', () => {});
    child.unref();
    return child;
  } finally {
    closeSync(fd);
  }
}

/**
 * Step 1 (URS-NF-015): install `tag` with this copy's own installer (download, checksum, dependencies) in
 * a process of its own, writing `JTD_HOME/update.log`. This server keeps running meanwhile.
 */
export function startUpdate(inst: Installation, tag: string, env: NodeJS.ProcessEnv, spawn: Spawn = nodeSpawn): { log: string; child: ReturnType<Spawn> } {
  const log = join(inst.home, 'update.log');
  const child =
    inst.flavour === 'bash'
      ? detached(spawn, inst, env, log, 'w', SHELL.bash, [join(inst.root, 'bin', 'install.sh'), tag])
      : // *>&1: Write-Host goes to the information stream, which a log file does not get otherwise. A throw is a failure too.
        detached(spawn, inst, env, log, 'w', SHELL.powershell, [...PS, `try { & ${quote(join(inst.root, 'bin', 'install.ps1'))} ${quote(tag)} *>&1 } catch { $_; exit 1 }; if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 0`]);
  return { log, child };
}

/**
 * Step 2, once the install has succeeded: a process of its own waits until this server stops answering at
 * `probe`, then starts the newly installed version with its launcher. The caller then exits this server.
 */
export function restartOnto(inst: Installation, env: NodeJS.ProcessEnv, probe: string, spawn: Spawn = nodeSpawn): void {
  const log = join(inst.home, 'update.log');
  if (inst.flavour === 'bash')
    detached(spawn, inst, env, log, 'a', SHELL.bash, ['-c', 'for _ in $(seq 1 60); do curl -sf "$1/health" >/dev/null 2>&1 || break; sleep 0.5; done; exec "$0/current/bin/jtddiagrammar" start --no-open', inst.home, probe]);
  else
    detached(spawn, inst, env, log, 'a', SHELL.powershell, [
      ...PS,
      [
        `for ($i = 0; $i -lt 60; $i++) { try { [void](Invoke-WebRequest -Uri ${quote(`${probe}/health`)} -UseBasicParsing -TimeoutSec 2) } catch { break }; Start-Sleep -Milliseconds 500 }`,
        "$v = (Get-Content (Join-Path $env:JTD_HOME 'current') -Raw).Trim()",
        "& (Join-Path (Join-Path (Join-Path (Join-Path $env:JTD_HOME 'versions') $v) 'bin') 'jtddiagrammar.ps1') start --no-open *>&1",
      ].join('; '),
    ]);
}

/** The last lines of the update log, for a failed update. */
export function tail(file: string, lines = 15): string {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}
