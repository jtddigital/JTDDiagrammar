import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job } from './updater.ts';

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

const UPDATER = fileURLToPath(new URL('./updater.ts', import.meta.url));

/**
 * Start the updater (updater.ts) for `tag`, in a Node process of its own that outlives this server, with
 * an IPC channel on which it says when the release is installed. Its log, `JTD_HOME/update.log`, starts
 * with what runs. A process that cannot start emits 'error': always listened to, so it never brings this
 * server down.
 */
export function startUpdate(inst: Installation, tag: string, env: NodeJS.ProcessEnv, probe: string, spawn: Spawn = nodeSpawn): { log: string; child: ReturnType<Spawn> } {
  const log = join(inst.home, 'update.log');
  const job: Job = { flavour: inst.flavour, root: inst.root, home: inst.home, tag, probe, log };
  const args = [UPDATER, JSON.stringify(job)];
  const fd = openSync(log, 'w');
  try {
    writeSync(fd, `${new Date().toISOString()} updating ${inst.version} to ${tag}: ${process.execPath} ${args.join(' ')}\n`);
    const child = spawn(process.execPath, args, { env, detached: true, stdio: ['ignore', fd, fd, 'ipc'], windowsHide: true, cwd: inst.home });
    child.on('error', () => {});
    child.unref();
    return { log, child };
  } finally {
    closeSync(fd);
  }
}

/** The last lines of the update log, for a failed update. */
export function tail(file: string, lines = 15): string {
  try {
    return readFileSync(file, 'utf8').trimEnd().split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}
