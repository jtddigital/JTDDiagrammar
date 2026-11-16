/**
 * The updater (URS-NF-015), a process of its own so it outlives the server it replaces:
 *   node updater.ts '<json Job>'
 * 1. Runs this copy's installer for the release; its output goes to the log.
 * 2. Tells the server (IPC) whether it installed. On failure it exits with the installer's code.
 * 3. Waits until the old server stops answering, then starts the new version's launcher and stays its
 *    parent: on Windows a child dies with a parent that is not detached.
 * A Node process, because Windows PowerShell started detached gets no console and does nothing; started
 * from here it gets one of its own (hidden).
 */
import { spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export interface Job {
  flavour: 'bash' | 'powershell';
  root: string;
  home: string;
  tag: string;
  /** Where the running server answers `/health`. */
  probe: string;
  log: string;
}

const powershell = () => (process.platform === 'win32' ? 'powershell' : 'pwsh');
const PS = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'];

/** The installer command for a job. */
export const installer = (j: Job): [string, string[]] =>
  j.flavour === 'bash' ? ['bash', [join(j.root, 'bin', 'install.sh'), j.tag]] : [powershell(), [...PS, join(j.root, 'bin', 'install.ps1'), j.tag]];

/** The new version's launcher, started once the old server has gone; `current` names it. */
export const launcher = (j: Job, current: string): [string, string[]] =>
  j.flavour === 'bash' ? [join(j.home, 'current', 'bin', 'jtddiagrammar'), ['start', '--no-open']] : [powershell(), [...PS, join(j.home, 'versions', current, 'bin', 'jtddiagrammar.ps1'), 'start', '--no-open']];

async function main(j: Job) {
  const fd = openSync(j.log, 'a');
  const say = (s: string) => writeSync(fd, `${new Date().toISOString()} ${s}\n`);
  const run = (cmd: string, args: string[]) => (say(`running: ${[cmd, ...args].join(' ')}`), { stdio: ['ignore', fd, fd], windowsHide: true, cwd: j.home } satisfies SpawnSyncOptions);

  const [cmd, args] = installer(j);
  const done = spawnSync(cmd, args, run(cmd, args));
  if (done.status !== 0) {
    say(done.error ? `the installer could not start: ${done.error.message}` : `the installer exited with ${done.status}`);
    process.exit(done.status || 1);
  }
  say(`installed ${j.tag}`);
  process.send?.({ installed: j.tag });
  process.disconnect?.();

  for (let i = 0; i < 120; i++) {
    const up = await fetch(`${j.probe}/health`, { signal: AbortSignal.timeout(2000) }).then(
      () => true,
      () => false,
    );
    if (!up) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const current = j.flavour === 'bash' ? '' : readFileSync(join(j.home, 'current'), 'utf8').trim();
  const [lcmd, largs] = launcher(j, current);
  const child = spawn(lcmd, largs, run(lcmd, largs));
  child.on('error', (e) => (say(`the launcher could not start: ${e.message}`), process.exit(1)));
  child.on('exit', (code) => {
    closeSync(fd);
    process.exit(code ?? 0);
  });
}

if (process.argv[1]?.endsWith('updater.ts')) void main(JSON.parse(process.argv[2] ?? '{}') as Job);
