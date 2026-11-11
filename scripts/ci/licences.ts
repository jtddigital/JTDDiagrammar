/** URS-NF-007: production dependencies must use permissive licences. Usage: pnpm licences */
import { execFileSync } from 'node:child_process';

const PERMISSIVE = new Set(['MIT', 'ISC', 'BSD', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Apache-2.0', 'OFL-1.1', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense', 'Zlib', 'Python-2.0']);

/** SPDX expression: an OR passes if any alternative passes; an AND only if every part does. */
export const allowed = (expr: string): boolean =>
  expr
    .replace(/[()]/g, '')
    .split(/ OR /)
    .some((alt) => alt.split(/ AND /).every((id) => PERMISSIVE.has(id.trim())));

if (process.argv[1]?.endsWith('licences.ts')) main();

function main() {
const out = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8' });
const byLicence = JSON.parse(out) as Record<string, { name: string; versions: string[] }[]>;
const bad = Object.entries(byLicence).filter(([licence]) => !allowed(licence));
for (const [licence, pkgs] of Object.entries(byLicence)) console.log(`${licence.padEnd(28)} ${pkgs.length} package(s)`);
if (bad.length) {
  console.error('\nNot allowed:');
  for (const [licence, pkgs] of bad) console.error(`  ${licence}: ${pkgs.map((p) => p.name).join(', ')}`);
  process.exit(1);
}
console.log('licences: ok');
}
