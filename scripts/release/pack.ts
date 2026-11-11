/**
 * Build the release bundle (URS-NF-012): the same file set as the Docker image (TypeScript sources,
 * built web app, lockfile) plus the launchers. Dependencies are installed on the target from the
 * lockfile, so one archive serves every OS.
 *   pnpm release:pack v1.2.3   →   dist-release/{jtddiagrammar.tar.gz, .sha256, install.sh, install.ps1}
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSET = 'jtddiagrammar.tar.gz';
const root = fileURLToPath(new URL('../../', import.meta.url));
const here = join(root, 'scripts/release');

/** Repository paths that make up the bundle. */
export const FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'LICENSE',
  'README.md',
  '.env.example',
  ...['core', 'ai', 'api'].flatMap((p) => [`packages/${p}/package.json`, `packages/${p}/src`]),
  'packages/web/package.json',
  'packages/web/dist',
];
export const LAUNCHERS = ['install.sh', 'install.ps1', 'jtddiagrammar', 'jtddiagrammar.ps1'];

export function pack(tag: string, out = join(root, 'dist-release'), buildWeb = true): string {
  if (!/^v\d+\.\d+\.\d+([-+][\w.-]+)?$/.test(tag)) throw new Error(`tag must look like v1.2.3, got '${tag}'`);
  const shell = process.platform === 'win32';
  if (buildWeb) execFileSync('pnpm', ['--filter', '@jtd/web', 'build'], { cwd: root, stdio: 'inherit', shell });
  const stage = join(out, 'jtddiagrammar');
  rmSync(out, { recursive: true, force: true });
  for (const f of FILES) cpSync(join(root, f), join(stage, f), { recursive: true });
  mkdirSync(join(stage, 'bin'));
  for (const f of LAUNCHERS) cpSync(join(here, f), join(stage, 'bin', f));
  writeFileSync(join(stage, 'VERSION'), `${tag}\n`);
  execFileSync('tar', ['-czf', ASSET, 'jtddiagrammar'], { cwd: out });
  const sum = createHash('sha256').update(readFileSync(join(out, ASSET))).digest('hex');
  writeFileSync(join(out, `${ASSET}.sha256`), `${sum}  ${ASSET}\n`);
  for (const f of ['install.sh', 'install.ps1']) cpSync(join(here, f), join(out, f));
  rmSync(stage, { recursive: true });
  return out;
}

if (process.argv[1]?.endsWith('pack.ts')) {
  const out = pack(process.argv[2] ?? 'v0.0.0-dev');
  console.log(`packed ${out}`);
}
