/**
 * URS-NF-004: every commit in the pushed range carries an impact assessment (URS §5).
 * Usage: tsx scripts/ci/commits.ts <base> <head>. Merge commits are exempt.
 */
import { execFileSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const range = base && !/^0+$/.test(base) ? `${base}..${head}` : head!;
const shas = git('rev-list', '--no-merges', range).split('\n').filter(Boolean);
const missing = shas.filter((sha) => !/^URS impacted:/m.test(git('log', '-1', '--format=%B', sha)));
for (const sha of missing) console.error(`${sha.slice(0, 8)} ${git('log', '-1', '--format=%s', sha)}: no "URS impacted:" section`);
console.log(`${shas.length - missing.length}/${shas.length} commits carry an impact assessment`);
process.exit(missing.length ? 1 : 0);
